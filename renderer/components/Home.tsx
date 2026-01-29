import React, { useState, useEffect } from 'react'
import Button from './Button';
import Modal from './Modal';
import { FileJson, Plus, FolderOpen } from 'lucide-react';

function Home() {
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [newFileName, setNewFileName] = useState('');
  const [currentFile, setCurrentFile] = useState('');

  const fetchFiles = async () => {
    const list = await (window as any).ipc.listFiles();
    setFiles(list);
  };

  const fetchCurrentFile = async () => {
    const name = await (window as any).ipc.getCurrentFile();
    setCurrentFile(name);
  };

  useEffect(() => {
    fetchCurrentFile();
  }, []);

  const handleLoadClick = async () => {
    await fetchFiles();
    setIsLoadModalOpen(true);
  };

  const handleSelectFile = async (filename: string) => {
    await (window as any).ipc.loadFile(filename);
    setCurrentFile(filename);
    setIsLoadModalOpen(false);
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;
    const name = newFileName.endsWith('.json') ? newFileName : `${newFileName}.json`;
    await (window as any).ipc.createFile(name);
    setCurrentFile(name);
    setIsNewModalOpen(false);
    setNewFileName('');
  };

  return (
    <div className='flex flex-col h-[calc(80vh)] items-center justify-center gap-6'>
      <div className="text-center mb-4">
        <h2 className='text-6xl font-light text-slate-800 mb-2'>Monlosim</h2>
        <p className="text-slate-400 flex items-center justify-center gap-2">
          <FileJson size={16} />
          Current data: <span className="text-green-600 font-medium">{currentFile}</span>
        </p>
      </div>

      <div className="flex flex-col gap-4 w-64">
        <Button onClick={() => {
          window.location.href = '/montecarlo/page';
        }}>
          Open Dashboard
        </Button>
        
        <Button onClick={handleLoadClick}>
          <div className="flex items-center gap-2 justify-center">
            <FolderOpen size={18} />
            Load Data
          </div>
        </Button>

        <Button onClick={() => setIsNewModalOpen(true)}>
          <div className="flex items-center gap-2 justify-center">
            <Plus size={18} />
            New Data
          </div>
        </Button>
      </div>

      {/* Load Modal */}
      <Modal 
        isOpen={isLoadModalOpen} 
        onClose={() => setIsLoadModalOpen(false)} 
        title="Select Data File"
      >
        <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
          {files.map(file => (
            <button
              key={file}
              onClick={() => handleSelectFile(file)}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                file === currentFile 
                ? 'bg-green-600 text-white' 
                : 'cursor-pointer bg-white border border-slate-700 hover:bg-slate-800 hover:text-white text-slate-800'
              }`}
            >
              <FileJson size={18} />
              <span className="truncate">{file}</span>
            </button>
          ))}
          {files.length === 0 && (
            <p className="text-slate-500 text-center py-4">No files found in iCloud folder.</p>
          )}
        </div>
      </Modal>

      {/* New Modal */}
      <Modal 
        isOpen={isNewModalOpen} 
        onClose={() => setIsNewModalOpen(false)} 
        title="Create New Data File"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-800">File Name</label>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="e.g. budget_2024"
              className="bg-gray-300 border border-slate-700 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-sans"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
              autoFocus
            />
          </div>
          <button
            onClick={handleCreateFile}
            disabled={!newFileName.trim()}
            className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20"
          >
            Create File
          </button>
        </div>
      </Modal>
    </div>
  )
}

export default Home