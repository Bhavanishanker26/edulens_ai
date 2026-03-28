import React, { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import Webcam from 'react-webcam';
import { Upload, Camera, X, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const ImageUpload = ({ onImageSelected, isProcessing }) => {
  const [useCamera, setUseCamera] = useState(false);
  const [preview, setPreview] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [fileName, setFileName] = useState('');
  const webcamRef = React.useRef(null);
  const inputRef = useRef(null); // ✅ Direct ref to hidden file input

  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      setFileType('pdf');
      setFileName(file.name);
      setPreview(null);
      onImageSelected(file);
    } else {
      setFileType('image');
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        setPreview(reader.result);
        onImageSelected(file);
      };
      reader.readAsDataURL(file);
    }
  }, [onImageSelected]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'image/*': [],
      'application/pdf': ['.pdf']
    },
    multiple: false,
    disabled: isProcessing,
    noClick: true,  // ✅ Disable default click so we control it manually
    noKeyboard: false,
  });

  // ✅ Manually trigger file picker on click
  const handleAreaClick = () => {
    if (!isProcessing) {
      open();
    }
  };

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current.getScreenshot();
    setPreview(imageSrc);
    setFileType('image');

    fetch(imageSrc)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });
        onImageSelected(file);
      });

    setUseCamera(false);
  }, [webcamRef, onImageSelected]);

  const clearPreview = () => {
    setPreview(null);
    setFileType(null);
    setFileName('');
    onImageSelected(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <AnimatePresence mode="wait">

        {/* ── Image Preview ── */}
        {fileType === 'image' && preview ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative rounded-2xl overflow-hidden shadow-2xl"
          >
            <img src={preview} alt="Preview" className="w-full h-96 object-cover" />
            {!isProcessing && (
              <button
                onClick={clearPreview}
                className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
              >
                <X size={20} />
              </button>
            )}
            {isProcessing && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <div className="text-white text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
                  <p className="text-lg font-semibold">AI is analyzing...</p>
                </div>
              </div>
            )}
          </motion.div>

        /* ── PDF Preview ── */
        ) : fileType === 'pdf' ? (
          <motion.div
            key="pdf-preview"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative rounded-2xl overflow-hidden shadow-2xl bg-gray-50 border border-gray-200"
          >
            <div className="flex flex-col items-center justify-center h-96 gap-4 px-6">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                <FileText className="w-10 h-10 text-red-500" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-800 break-all">{fileName}</p>
                <p className="text-sm text-gray-500 mt-1">PDF ready to process</p>
              </div>
              {isProcessing && (
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  <p className="text-sm text-blue-600 font-medium">AI is analyzing...</p>
                </div>
              )}
            </div>
            {!isProcessing && (
              <button
                onClick={clearPreview}
                className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
              >
                <X size={20} />
              </button>
            )}
          </motion.div>

        /* ── Camera ── */
        ) : useCamera ? (
          <motion.div
            key="camera"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative rounded-2xl overflow-hidden shadow-2xl bg-black"
          >
            <Webcam
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              className="w-full h-96"
              videoConstraints={{ facingMode: "environment" }}
            />
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
              <button
                onClick={capture}
                className="px-6 py-3 bg-white text-black rounded-full font-semibold hover:bg-gray-100 transition-colors"
              >
                Capture
              </button>
              <button
                onClick={() => setUseCamera(false)}
                className="px-6 py-3 bg-gray-800 text-white rounded-full hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>

        /* ── Default Upload Area ── */
        ) : (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* ✅ Dropzone handles drag-and-drop; click is handled manually via handleAreaClick */}
            <div
              {...getRootProps()}
              onClick={handleAreaClick}
              className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${
                isProcessing
                  ? 'opacity-50 cursor-not-allowed border-gray-200'
                  : isDragActive
                  ? 'border-blue-500 bg-blue-50 cursor-copy'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
              }`}
            >
              <input {...getInputProps()} />
              <div className="space-y-4">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto transition-colors ${
                  isDragActive ? 'bg-blue-200' : 'bg-blue-100'
                }`}>
                  <Upload className={`w-10 h-10 ${isDragActive ? 'text-blue-700' : 'text-blue-600'}`} />
                </div>
                <div>
                  <p className="text-xl font-semibold text-gray-800">
                    {isDragActive ? 'Drop file here' : 'Drag & drop your study material'}
                  </p>
                  <p className="text-gray-500 mt-2">or click to browse</p>
                  <div className="flex justify-center gap-2 mt-3">
                    {['PDF', 'PNG', 'JPG', 'JPEG', 'WEBP'].map(fmt => (
                      <span
                        key={fmt}
                        className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md font-medium"
                      >
                        {fmt}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setUseCamera(true)}
                disabled={isProcessing}
                className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Camera size={20} />
                <span>Use Camera</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};