// Create a lyout for the application pages
import React from 'react'
import ScaledTableWrapper from '../components/TableWrapper';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className='bg-white'>
    
    <ScaledTableWrapper>
      {children}
    </ScaledTableWrapper>
    </div>
}