import React from 'react'
import Button from './Button';

function Home() {
  return (
    <div className='flex flex-row h-screen items-center justify-around gap-10'>
        <div className='flex text-slate-800 items-center justify-center'>
            <h2 className='text-5xl text-center'>Monlosim</h2>
        </div>
        <div className='flex text-slate-800 items-center justify-center'>
            <div className='flex flex-col items-center justify-center'>
                <Button onClick={() => {
                   // redirect to montecarlo page
                   window.location.href = '/montecarlo/page';
                }}>
                    New Simulation
                </Button>
            </div>
        </div>
    </div>
  )
}

export default Home