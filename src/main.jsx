/**
 * main.jsx
 * Application entry point. Mounts the React tree, wraps it in the
 * MockMentorProvider context, and sets up BrowserRouter.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { MockMentorProvider } from './context/MockMentorContext';

import './styles/global.css';
import './styles/theme.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <MockMentorProvider>
        <App />
      </MockMentorProvider>
    </BrowserRouter>
  </React.StrictMode>
);
