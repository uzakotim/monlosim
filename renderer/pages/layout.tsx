// src/renderer/components/Layout.tsx (Assuming this path structure)
import React from 'react';
import ScaledTableWrapper from '../components/TableWrapper';
import { useEffect, useState } from 'react';

// Define styles
const titleBarStyle: React.CSSProperties = {
  backgroundColor: '#ffffffff',
  color: '#0f061fff',
  height: '40px',
  padding: '0 10px',
  display: 'flex',
  justifyContent: 'space-between', // Aligns title left, buttons right
  alignItems: 'center',
};

const buttonContainerStyle: React.CSSProperties = {
  display: 'flex',
  height: '100%',
};

const controlButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'white',
  padding: '0 10px',
  cursor: 'pointer',
  fontSize: '16px',
};


export default function Layout({ children }: { children: React.ReactNode }) {
  // Handlers that call functions exposed by the preload script
  const handleMinimize = () => (window as any).ipc.minimizeWindow();

  const handleMaximize = () => (window as any).ipc.maximizeWindow();
  const handleClose = () => (window as any).ipc.closeWindow();
 const [windowState, setWindowState] = useState('restored');

  useEffect(() => {
    // Listen for state changes from the main process
    if ((window as any).ipc && (window as any).ipc.onWindowStateChange) {
      const unsubscribe = (window as any).ipc.onWindowStateChange((state: string) => {
        setWindowState(state);
      });
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, []);
  // Use a class name to trigger CSS transitions
  const contentClassName = `app-content ${windowState === 'maximized' ? 'maximized' : ''}`;
  return (
    <div className='bg-white'>
      
      <div id="custom-title-bar" style={titleBarStyle}>
       
        
        {/* Window Controls */}
        <div style={buttonContainerStyle}>
          <button className="window-control-btn close" onClick={handleClose}>✕</button>
          <button className="window-control-btn" onClick={handleMinimize}>—</button>
          <button className="window-control-btn" onClick={handleMaximize}>
            {windowState === 'maximized' ? '❐' : '◻'}
          </button>
        </div>
      </div>
      
      <div className={contentClassName}>
        <ScaledTableWrapper>
          {children}
        </ScaledTableWrapper>
      </div>
    </div>
  );
}
