import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import App from './App'
import DownloadPage from './pages/DownloadPage'
import './styles/index.css'
import i18n from './i18n/config'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/download/:taskId" element={<DownloadPage />} />
        </Routes>
      </BrowserRouter>
    </I18nextProvider>
  </React.StrictMode>,
)

