/**
 * Code Type Detection Utility
 * 
 * Automatically detects the type of code content to determine
 * the appropriate build pipeline.
 */

export type CodeType = 
  | 'html'           // Pure HTML (may have inline CSS/JS)
  | 'html-react'     // HTML with embedded React (Babel standalone)
  | 'react-component' // Pure React/JSX/TSX component code
  | 'unknown';

export interface DetectionResult {
  type: CodeType;
  confidence: number;  // 0-100
  hints: string[];     // Detected features that led to this classification
  suggestedFilename: string;
}

// Patterns for detecting React component code
const REACT_IMPORT_PATTERNS = [
  /^import\s+React/m,
  /^import\s+\{[^}]*\}\s+from\s+['"]react['"]/m,
  /^import\s+\*\s+as\s+React\s+from\s+['"]react['"]/m,
];

const REACT_EXPORT_PATTERNS = [
  /export\s+default\s+function\s+\w+/,
  /export\s+default\s+class\s+\w+/,
  /export\s+default\s+\(\)/,  // arrow function export
  /export\s+default\s+memo\(/,
  /export\s+default\s+forwardRef\(/,
];

const JSX_PATTERNS = [
  /<[A-Z][a-zA-Z0-9]*[\s/>]/,  // JSX component tags (PascalCase)
  /className\s*=/,
  /onClick\s*=/,
  /onChange\s*=/,
  /useState\s*\(/,
  /useEffect\s*\(/,
  /useRef\s*\(/,
  /useMemo\s*\(/,
  /useCallback\s*\(/,
];

const TYPESCRIPT_PATTERNS = [
  /:\s*(string|number|boolean|any|void|never)\b/,
  /interface\s+\w+\s*\{/,
  /type\s+\w+\s*=/,
  /<[A-Z][a-zA-Z0-9]*>/,  // Generic types
  /as\s+(string|number|boolean|any|const)\b/,
];

// Patterns for detecting HTML structure
const HTML_STRUCTURE_PATTERNS = [
  /<!DOCTYPE\s+html/i,
  /<html[\s>]/i,
  /<head[\s>]/i,
  /<body[\s>]/i,
];

// Patterns for detecting embedded React in HTML
const EMBEDDED_REACT_PATTERNS = [
  /<script[^>]*type\s*=\s*["']text\/babel["'][^>]*>/i,
  /cdn\.tailwindcss\.com/i,
  /unpkg\.com\/react/i,
  /cdnjs\.cloudflare\.com\/ajax\/libs\/react/i,
  /@babel\/standalone/i,
  /ReactDOM\.render/,
  /ReactDOM\.createRoot/,
];

/**
 * Detect the type of code content
 */
export function detectCodeType(content: string): DetectionResult {
  const trimmed = content.trim();
  const hints: string[] = [];
  
  // Count matches for each category
  let htmlScore = 0;
  let reactComponentScore = 0;
  let embeddedReactScore = 0;
  
  // Check for HTML structure
  for (const pattern of HTML_STRUCTURE_PATTERNS) {
    if (pattern.test(trimmed)) {
      htmlScore += 25;
      hints.push(`HTML structure: ${pattern.source.slice(0, 20)}`);
    }
  }
  
  // Check for embedded React in HTML
  for (const pattern of EMBEDDED_REACT_PATTERNS) {
    if (pattern.test(trimmed)) {
      embeddedReactScore += 20;
      hints.push(`Embedded React: ${pattern.source.slice(0, 30)}`);
    }
  }
  
  // Check for React imports (strong indicator of pure React component)
  for (const pattern of REACT_IMPORT_PATTERNS) {
    if (pattern.test(trimmed)) {
      reactComponentScore += 30;
      hints.push(`React import detected`);
      break; // Only count once
    }
  }
  
  // Check for React exports
  for (const pattern of REACT_EXPORT_PATTERNS) {
    if (pattern.test(trimmed)) {
      reactComponentScore += 25;
      hints.push(`React export pattern`);
      break;
    }
  }
  
  // Check for JSX patterns
  let jsxCount = 0;
  for (const pattern of JSX_PATTERNS) {
    if (pattern.test(trimmed)) {
      jsxCount++;
    }
  }
  if (jsxCount > 0) {
    reactComponentScore += Math.min(jsxCount * 5, 25);
    hints.push(`JSX patterns: ${jsxCount} found`);
  }
  
  // Check for TypeScript patterns (boost React component score)
  let tsCount = 0;
  for (const pattern of TYPESCRIPT_PATTERNS) {
    if (pattern.test(trimmed)) {
      tsCount++;
    }
  }
  if (tsCount > 0) {
    reactComponentScore += Math.min(tsCount * 3, 15);
    hints.push(`TypeScript patterns: ${tsCount} found`);
  }
  
  // Determine the type based on scores
  let type: CodeType;
  let confidence: number;
  
  // If it has HTML structure
  if (htmlScore >= 25) {
    if (embeddedReactScore >= 20) {
      type = 'html-react';
      confidence = Math.min(htmlScore + embeddedReactScore, 100);
    } else {
      type = 'html';
      confidence = Math.min(htmlScore, 100);
    }
  }
  // If it has React patterns but no HTML structure
  else if (reactComponentScore >= 30) {
    type = 'react-component';
    confidence = Math.min(reactComponentScore, 100);
  }
  // Low confidence cases
  else if (reactComponentScore > htmlScore) {
    type = 'react-component';
    confidence = Math.min(reactComponentScore, 100);
  }
  else if (htmlScore > 0) {
    type = 'html';
    confidence = Math.min(htmlScore, 100);
  }
  else {
    type = 'unknown';
    confidence = 0;
  }
  
  // Determine suggested filename based on type
  let suggestedFilename: string;
  switch (type) {
    case 'react-component':
      suggestedFilename = tsCount > 0 ? 'App.tsx' : 'App.jsx';
      break;
    case 'html-react':
    case 'html':
      suggestedFilename = 'index.html';
      break;
    default:
      suggestedFilename = 'code.txt';
  }
  
  return {
    type,
    confidence,
    hints,
    suggestedFilename,
  };
}

/**
 * Extract app name hint from React component code
 * Looks for the default export function/class name
 */
export function extractAppNameFromCode(content: string): string | null {
  // Try to find export default function Name
  const funcMatch = content.match(/export\s+default\s+function\s+(\w+)/);
  if (funcMatch) return funcMatch[1];
  
  // Try to find export default class Name
  const classMatch = content.match(/export\s+default\s+class\s+(\w+)/);
  if (classMatch) return classMatch[1];
  
  // Try to find function Name at the start and export default Name at the end
  const namedFunc = content.match(/function\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]*\}\s*export\s+default\s+\1/);
  if (namedFunc) return namedFunc[1];
  
  // Try to find const Name = ... export default Name
  const constMatch = content.match(/const\s+(\w+)\s*=[\s\S]*export\s+default\s+\1/);
  if (constMatch) return constMatch[1];
  
  return null;
}

/**
 * Quick check if content looks like a React component
 */
export function isLikelyReactComponent(content: string): boolean {
  const result = detectCodeType(content);
  return result.type === 'react-component' && result.confidence >= 50;
}

/**
 * Quick check if content looks like HTML with embedded React
 */
export function isLikelyHtmlWithReact(content: string): boolean {
  const result = detectCodeType(content);
  return result.type === 'html-react' && result.confidence >= 50;
}

