import { memo, useEffect, useRef, useState } from "react";
import { InboxOutlined } from "@ant-design/icons";
import "./app.css";
import useDrag from "./useDrag";
import { Button, message, Progress, Spin } from "antd";
import axios from "axios";
import { CHUNK_SIZE } from "./constant";
import axisoInstance from "./axiosInstance";

const UploadStatus = {
  NOT_STARTED: "NOT_STARTED",
  UPLOADING: "UPLOADING",
  PAUSED: "PAUSED",
};

const Index = () => {
  const uploadContainerRef = useRef(null);
  const { filePreview, selectedFile, resetFileStatus } =
    useDrag(uploadContainerRef);
  const [uploadProgress, setUploadProgress] = useState({});
  // 控制上传的状态
  const [uploadStatus, setUploadStatus] = useState(UploadStatus.NOT_STARTED);
  // 存放所有上传请求的取消token
  const [cancelTokens, setCancelTokens] = useState([]);
  const [filenameWorker, setFilenameWoker] = useState(null);
  const [isCalculatingFilename, setIsCalculatingFilename] = useState(false);
  useEffect(() => {
    const curFilenameWorker = new Worker("/filenameWorker.js");
    setFilenameWoker(curFilenameWorker);
  }, []);
  const resetAllStatus = () => {
    setUploadProgress({}), resetFileStatus();
    setUploadStatus(UploadStatus.NOT_STARTED);
  };
  const handleUpload = async () => {
    if (!selectedFile) {
      message.error("没有文件");
      return;
    }
    setUploadStatus(UploadStatus.UPLOADING);
    filenameWorker.postMessage(selectedFile);
    setIsCalculatingFilename(true);
    filenameWorker.onmessage = async (event) => {
      setIsCalculatingFilename(false);
      await upLoadFile(
        selectedFile,
        event.data,
        setUploadProgress,
        resetAllStatus,
        setCancelTokens
      );
    };
    console.log(filename, "@@@");
  };
  const pauseUpload = () => {
    setUploadStatus(UploadStatus.PAUSED);
    cancelTokens.forEach((cancelToken) =>
      cancelToken.cancel("用户主动暂停了上传")
    );
  };
  const renderBtn = () => {
    switch (uploadStatus) {
      case UploadStatus.NOT_STARTED:
        return <Button onClick={handleUpload}>上传</Button>;
      case UploadStatus.UPLOADING:
        return <Button onClick={pauseUpload}>暂停</Button>;
      case UploadStatus.PAUSED:
        return <Button onClick={handleUpload}>恢复上传</Button>;
    }
    return <Button onClick={handleUpload}>上传</Button>;
  };
  const renderProgress = () => {
    return Object.keys(uploadProgress).map((chunkName, index) => (
      <div>
        <span>切片{index}:</span>
        <Progress percent={uploadProgress[chunkName]} />
      </div>
    ));
  };
  return (
    <>
      <div className="upload-container" ref={uploadContainerRef}>
        {renderFilePreview(filePreview)}
      </div>
      {renderBtn()}
      {isCalculatingFilename && (
        <div>
          <Spin></Spin>
          正在计算文件名。。。
        </div>
      )}
      {renderProgress()}
    </>
  );
};
function createRequest(
  filename,
  chunkFileName,
  chunk,
  setUploadProgress,
  cancelToken,
  start
) {
  return axisoInstance.post(`/upload/${filename}`, chunk, {
    headers: {
      "Content-Type": "application/octet-stream", // 文件流上传格式
    },
    params: {
      chunkFileName,
      start, // 写入文件的起始位置
    },
    onUploadProgress: (progressEvent) => {
      const percentCompleted = Math.round(
        (progressEvent.loaded * 100) / progressEvent.total
      );
      setUploadProgress((prevProgress) => ({
        ...prevProgress,
        [chunkFileName]: percentCompleted,
      }));
    },
    cancelToken: cancelToken.token,
  });
}
/**
 * 实现切片上传大文件
 * @param {*} file 大文件
 * @param {*} filename 文件名
 */
async function upLoadFile(
  file,
  filename,
  setUploadProgress,
  resetAllStatus,
  setCancelTokens
) {
  const { needUpload, uploadedChunkList } = await axisoInstance.get(
    `/verify/${filename}`
  );
  if (!needUpload) {
    message.success(`文件已存在，秒传成功`);
    return resetAllStatus();
  }
  // 把文件切片
  const chunks = createFileChunks(file, filename);
  const newCancelTokens = [];
  // 并行上传
  console.log(chunks);
  // 创建分片请求
  const requests = chunks.map(({ chunk, chunkFileName }, index) => {
    const cancelToken = axios.CancelToken.source();
    newCancelTokens.push(cancelToken);
    // 给服务发送的数据可能不是完整数据 所以需要判断切割
    // 判断当前的分片是不是已经上传过服务器
    const existingChunk = uploadedChunkList.find((uploadedChunk) => {
      return uploadedChunk.chunkFileName === chunkFileName;
    });
    // 说明此分片已经上传过服务器一部分 或 完全上传过了
    if (existingChunk) {
      // 获取已经上传的分片的大小
      const uploadedSize = existingChunk.size;
      // 从chunk中进行截取过滤已经上传过的大小 拿到继续需要上传的文件内容
      const remainingChunk = chunk.slice(uploadedSize);
      if (remainingChunk.size === 0) {
        return Promise.resolve();
      }
      return createRequest(
        filename,
        chunkFileName,
        remainingChunk,
        setUploadProgress,
        cancelToken,
        uploadedSize
      );
    } else {
      return createRequest(
        filename,
        chunkFileName,
        chunk,
        setUploadProgress,
        cancelToken,
        0
      );
    }
  });
  setCancelTokens(newCancelTokens);
  try {
    // 并行上传每个分片
    await Promise.all(requests);
    // 等全部分片上传完毕，会向服务器发送一个合并的请求
    await axisoInstance.get(`/merge/${filename}`);
    message.success("上传完成");
    resetAllStatus();
  } catch (error) {
    if (axios.isCancel(error)) {
      message.warning("暂停成功");
      console.log("暂停成功", error);
    } else {
      message.error("上传异常");
      console.log("上传失败", error);
    }
  }
}
/**
 * 文件分片
 * @param {*} file
 * @param {*} filename
 */
function createFileChunks(file, filename) {
  let chunks = [];
  // 一共切成多少片
  let count = Math.ceil(file.size / CHUNK_SIZE);
  for (let i = 0; i < count; i++) {
    let chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    chunks.push({
      chunk,
      chunkFileName: `${filename}-${i}`,
    });
  }
  return chunks;
}
/**
 * 文件预览
 * @param {*} filePreview
 */
function renderFilePreview(filePreview) {
  const { url, type } = filePreview;
  if (url) {
    if (type.startsWith("video/")) {
      return <video src={url} alt="preview" controls />;
    } else if (type.startsWith("image/")) {
      return <img src={url} alt="preview"></img>;
    } else {
      return url;
    }
  } else {
    return <InboxOutlined />;
  }
}
export default memo(Index);
