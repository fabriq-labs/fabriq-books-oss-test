import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initializeImportExtensions } from './features/import-extensions'

// Initialize import extensions before rendering
initializeImportExtensions();

createRoot(document.getElementById("root")!).render(<App />);
