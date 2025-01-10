const express = require("express");
const logger = require("morgan");
const { StatusCodes } = require("http-status-code");
const cors = require("cors");
const fs = require("fs-extra");
const path = require("path");
const PUBLIC_DIR = path.resolve(__dirname, "public");
const TEMP_DIR = path.resolve(__dirname, "temp");
const CHUNK_SIZE = 30 * 1024 * 1024; // 30m
// 存放上传并合并好的目录
fs.emptyDirSync(PUBLIC_DIR);
// 存放分片文件的目录
fs.emptyDirSync(TEMP_DIR);
const app = express();

app.use(logger("dev"));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve(__dirname, "public")));
/**
 * 上传分片
 */
app.post("/upload/:filename", async (req, res, next) => {
  const { filename } = req.params;
  const { chunkFileName } = req.query;
  const start = isNaN(req.query.start) ? 0 : parseInt(req.query.start, 10);
  // 创建用户保存此文件的分片目录
  const chunkDir = path.resolve(TEMP_DIR, filename);
  // 分片的文件名
  const chunkFilePath = path.resolve(chunkDir, chunkFileName);
  // 先确定分片的目录存在
  await fs.ensureDir(chunkDir);
  // 创建此文件的可写流
  const ws = fs.createWriteStream(chunkFilePath, { start, flags: "a" });
  // 后面会实现暂停的操作，如果客户端点击了暂停按钮，会取消上传的操作
  //    取消之后会在服务端触发请求对象的aborted事件，我们就关闭可写流
  req.on("aborted", () => {
    ws.close();
  });
  // 使用管道的方式把请求中的请求体流数据写入到文件中
  try {
    await pipeStream(req, ws);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get("/merge/:filename", async (req, res, next) => {
  const { filename } = req.params;
  console.log("upload filename", filename);
  try {
    await mergeChunks(filename);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
app.get("/verify/:filename", async (req, res, next) => {
  const { filename } = req.params;
  const filePath = path.resolve(PUBLIC_DIR, filename);
  const isExist = await fs.pathExists(filePath);
  if (isExist) {
    return res.json({ success: true, needUpload: false });
  }
  const chunkDir = path.resolve(TEMP_DIR, filename);
  const exsitDir = await fs.pathExists(chunkDir);
  // 存放已经上传的分片的对象数组
  let uploadedChunkList = [];
  if (exsitDir) {
    const chunkFileNames = await fs.readdir(chunkDir);
    uploadedChunkList = await Promise.all(
      chunkFileNames.map(async function (chunkFileName) {
        const { size } = await fs.stat(path.resolve(chunkDir, chunkFileName));
        return {
          chunkFileName,
          size,
        };
      })
    );
  }
  // 返回，上传尚未完成，但是已经上传了一部分
  res.json({ success: true, needUpload: true, uploadedChunkList });
});
async function mergeChunks(filename) {
  const mergedFilePath = path.resolve(PUBLIC_DIR, filename);
  const chunkDir = path.resolve(TEMP_DIR, filename);
  const chunkFiles = await fs.readdir(chunkDir);
  console.log("chunkFiles", chunkFiles);
  // 对文件用索引进行排序
  chunkFiles.sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));
  try {
    // 为了提高性能可以进行并行写入
    const pipes = chunkFiles.map((chunkFile, index) => {
      return pipeStream(
        fs.createReadStream(path.resolve(chunkDir, chunkFile), {
          autoClose: true,
        }),
        fs.createWriteStream(path.resolve(mergedFilePath), {
          start: index * CHUNK_SIZE, // 从哪个位置开始写入
        })
      );
    });
    // 并发把每个分片的数据写入到目标文件中
    await Promise.all(pipes);
    await fs.rmdir(chunkDir, { recursive: true });
  } catch (error) {
    next(error);
  }
}

function pipeStream(rs, ws) {
  return new Promise((resolve, reject) => {
    // 把可读流数据写入到可写流
    rs.pipe(ws).on("finish", resolve).on("error", reject);
  });
}

app.listen(8080, () => {
  console.log("服务器启动成功");
});
