import React from 'react'

function Button({onClick, children} : {children: React.ReactNode, onClick?: () => void}) {
  return (
        <button onClick={onClick} className='bg-white border border-slate-800 hover:border-blue-700 text-slate-800 py-3 px-5 rounded-xl'>
            {children}
        </button>
  )
}

export default Button