// Create a lyout for the application pages
import React from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className='bg-white'>{children}</div>
}