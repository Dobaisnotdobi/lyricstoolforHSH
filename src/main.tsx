import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import BookmarkSetup from './BookmarkSetup';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {new URLSearchParams(location.search).get('setup') === 'bugs' ? <BookmarkSetup /> : <App />}
  </StrictMode>,
);
