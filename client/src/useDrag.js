import { useState, useEffect, useCallback } from "react";
import { message } from "antd";
import { MAX_FILE_SIZE } from "./constant";

function useDrag(uploadContainerRef) {
  // 保存用户选择的文件
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState({ url: null, type: null });
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  const checkFile = (files) => {
    const file = files[0];
    if (!file) {
      return message.error("没有选择任何文件");
    }
    if (file.size > MAX_FILE_SIZE) {
      return message.error("文件大小不能超过2g");
    }
    if (!(file.type.startsWith("image/") || file.type.startsWith("video/"))) {
      return message.error("文件类型必须是图片或视频");
    }
    console.log(file)
    setSelectedFile(file);
  };
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    checkFile(e.dataTransfer.files);
  }, []);
  useEffect(() => {
    const uploadContainer = uploadContainerRef.current;

    uploadContainer.addEventListener("dragenter", handleDrag);
    uploadContainer.addEventListener("dragover", handleDrag);
    uploadContainer.addEventListener("drop", handleDrop);
    uploadContainer.addEventListener("dragleave", handleDrag);
    return () => {
      uploadContainer.removeEventListener("dragenter", handleDrag);
      uploadContainer.removeEventListener("dragover", handleDrag);
      uploadContainer.removeEventListener("drop", handleDrop);
      uploadContainer.removeEventListener("dragleave", handleDrag);
    };
  }, []);
  useEffect(() => {
    if (!selectedFile) return;
    // 创建临时的url 本地可以访问
    const url = URL.createObjectURL(selectedFile);
    setFilePreview({ url, type: selectedFile.type });
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedFile]);
  const resetFileStatus = () => {
    setSelectedFile(null)
    setFilePreview({url:null,type:null})
  }
  return {
    filePreview,
    selectedFile,
    resetFileStatus
  };
}

export default useDrag;
