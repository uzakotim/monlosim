import React from 'react'
import Button from './Button';

function Home() {
  return (
    <div className='flex flex-col h-[calc(80vh)] items-center justify-center gap-10'>
            <h2 className='text-5xl text-center'>Monlosim</h2>
                <Button onClick={() => {
                   // redirect to montecarlo page
                   window.location.href = '/montecarlo/page';
                }}>
                    New Simulation
                </Button>
    </div>
  )
}

export default Home