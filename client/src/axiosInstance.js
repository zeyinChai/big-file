import axios from "axios";

const axisoInstance = axios.create({
  baseURL: "http://localhost:8080",
});
axisoInstance.interceptors.response.use(
  (response) => {
    if (response.data && response.data.success) {
      return response.data;
    } else {
      throw new Error(response.data.message || "服务器异常");
    }
  },
  (error) => {
    throw error;
  }
);

export default axisoInstance;
