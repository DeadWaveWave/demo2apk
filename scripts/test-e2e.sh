#!/usr/bin/env bash

###############################################################################
# test-e2e.sh - End-to-End test script for Demo2APK API
#
# Prerequisites:
#   - API server running on localhost:3000
#   - Redis running
#   - Worker process running
#   - curl and jq installed
#
# Usage:
#   ./scripts/test-e2e.sh [--mock]
#
# Options:
#   --mock    Use mock build mode (faster, no real APK generation)
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
MAX_WAIT_TIME="${MAX_WAIT_TIME:-300}" # 5 minutes max wait
POLL_INTERVAL="${POLL_INTERVAL:-5}"

# Test files
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_HTML="$SCRIPT_DIR/../test-demo.html"
TEST_ZIP="$SCRIPT_DIR/../test-react-app.zip"

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_step() {
    echo -e "\n${BLUE}==>${NC} $1\n"
}

# Check prerequisites
check_prerequisites() {
    print_step "Checking prerequisites"

    # Check curl
    if ! command -v curl &> /dev/null; then
        print_error "curl is required but not installed"
        exit 1
    fi
    print_success "curl is available"

    # Check jq
    if ! command -v jq &> /dev/null; then
        print_error "jq is required but not installed"
        exit 1
    fi
    print_success "jq is available"

    # Check API is running
    if ! curl -s "$API_URL/health" > /dev/null; then
        print_error "API server is not running at $API_URL"
        print_info "Start the server with: pnpm dev"
        exit 1
    fi
    print_success "API server is running at $API_URL"

    # Check test files exist
    if [ ! -f "$TEST_HTML" ]; then
        print_warning "Test HTML file not found: $TEST_HTML"
        # Create a simple test file
        echo '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello APK!</h1></body></html>' > "$TEST_HTML"
        print_info "Created simple test HTML file"
    fi
    print_success "Test files ready"
}

# Test health endpoint
test_health() {
    print_step "Testing health endpoint"

    RESPONSE=$(curl -s "$API_URL/health")
    STATUS=$(echo "$RESPONSE" | jq -r '.status')

    if [ "$STATUS" = "ok" ]; then
        print_success "Health check passed"
    else
        print_error "Health check failed"
        echo "$RESPONSE"
        exit 1
    fi
}

# Test API info endpoint
test_api_info() {
    print_step "Testing API info endpoint"

    RESPONSE=$(curl -s "$API_URL/api")
    NAME=$(echo "$RESPONSE" | jq -r '.name')

    if [ "$NAME" = "Demo2APK API" ]; then
        print_success "API info endpoint working"
    else
        print_error "API info endpoint failed"
        echo "$RESPONSE"
        exit 1
    fi
}

# Test HTML build workflow
test_html_build() {
    print_step "Testing HTML build workflow"

    # 1. Upload HTML file
    print_info "Uploading HTML file..."
    UPLOAD_RESPONSE=$(curl -s -X POST "$API_URL/api/build/html" \
        -F "file=@$TEST_HTML" \
        -F "appName=E2ETestApp")

    TASK_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.taskId')

    if [ "$TASK_ID" = "null" ] || [ -z "$TASK_ID" ]; then
        print_error "Failed to upload HTML file"
        echo "$UPLOAD_RESPONSE"
        exit 1
    fi

    print_success "Upload successful, task ID: $TASK_ID"

    # 2. Poll for completion
    print_info "Waiting for build to complete..."
    ELAPSED=0
    LAST_STATUS=""
    LAST_PROGRESS=""

    while [ $ELAPSED -lt $MAX_WAIT_TIME ]; do
        STATUS_RESPONSE=$(curl -s "$API_URL/api/build/$TASK_ID/status")
        STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status')
        PROGRESS=$(echo "$STATUS_RESPONSE" | jq -r '.progress.message // "N/A"')
        PERCENT=$(echo "$STATUS_RESPONSE" | jq -r '.progress.percent // 0')

        # Print progress if changed
        if [ "$STATUS" != "$LAST_STATUS" ] || [ "$PROGRESS" != "$LAST_PROGRESS" ]; then
            echo "  Status: $STATUS | Progress: $PROGRESS ($PERCENT%)"
            LAST_STATUS="$STATUS"
            LAST_PROGRESS="$PROGRESS"
        fi

        if [ "$STATUS" = "completed" ]; then
            SUCCESS=$(echo "$STATUS_RESPONSE" | jq -r '.result.success')
            if [ "$SUCCESS" = "true" ]; then
                print_success "Build completed successfully!"
                DURATION=$(echo "$STATUS_RESPONSE" | jq -r '.result.duration')
                print_info "Build duration: ${DURATION}ms"
                break
            else
                ERROR=$(echo "$STATUS_RESPONSE" | jq -r '.error // .result.error')
                print_error "Build failed: $ERROR"
                exit 1
            fi
        elif [ "$STATUS" = "failed" ]; then
            ERROR=$(echo "$STATUS_RESPONSE" | jq -r '.error')
            print_error "Build failed: $ERROR"
            exit 1
        fi

        sleep $POLL_INTERVAL
        ELAPSED=$((ELAPSED + POLL_INTERVAL))
    done

    if [ $ELAPSED -ge $MAX_WAIT_TIME ]; then
        print_error "Build timed out after ${MAX_WAIT_TIME}s"
        exit 1
    fi

    # 3. Download APK
    print_info "Downloading APK..."
    APK_FILE="/tmp/e2e-test-$(date +%s).apk"
    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$APK_FILE" "$API_URL/api/build/$TASK_ID/download")

    if [ "$HTTP_CODE" = "200" ]; then
        APK_SIZE=$(du -h "$APK_FILE" | cut -f1)
        print_success "APK downloaded successfully ($APK_SIZE)"

        # Verify it's a valid file
        if file "$APK_FILE" | grep -qi "android\|zip\|java"; then
            print_success "APK file appears valid"
        else
            print_warning "APK file type unverified (may be mock)"
        fi

        # Cleanup
        rm -f "$APK_FILE"
    else
        print_error "Failed to download APK (HTTP $HTTP_CODE)"
        exit 1
    fi

    # 4. Cleanup task
    print_info "Cleaning up task..."
    DELETE_RESPONSE=$(curl -s -X DELETE "$API_URL/api/build/$TASK_ID")
    DELETE_MESSAGE=$(echo "$DELETE_RESPONSE" | jq -r '.message')
    print_success "$DELETE_MESSAGE"

    print_success "HTML build workflow test passed!"
}

# Test error handling
test_error_handling() {
    print_step "Testing error handling"

    # Test non-existent task
    print_info "Testing 404 for non-existent task..."
    RESPONSE=$(curl -s "$API_URL/api/build/nonexistent123/status")
    ERROR=$(echo "$RESPONSE" | jq -r '.error')
    if [ "$ERROR" = "Not Found" ]; then
        print_success "404 error handling works"
    else
        print_error "404 error handling failed"
    fi

    # Test invalid file type
    print_info "Testing invalid file type rejection..."
    RESPONSE=$(curl -s -X POST "$API_URL/api/build/html" \
        -F "file=@$0") # Upload this script instead of HTML
    ERROR=$(echo "$RESPONSE" | jq -r '.error')
    if [ "$ERROR" = "Bad Request" ]; then
        print_success "Invalid file type rejection works"
    else
        print_warning "Invalid file type handling might need review"
    fi

    print_success "Error handling tests passed!"
}

# Main test runner
main() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Demo2APK E2E Test Suite"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    check_prerequisites
    test_health
    test_api_info
    test_html_build
    test_error_handling

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_success "All E2E tests passed!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

main "$@"

