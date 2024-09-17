# Sử dụng Node.js làm base image
FROM node:20

# Tạo thư mục ứng dụng
WORKDIR /usr/src/app

# Sao chép package.json và package-lock.json (nếu có)
COPY package*.json ./

# Cài đặt dependencies
RUN npm install

# Sao chép source code của ứng dụng
COPY . .

# Build ứng dụng
RUN npm run build

COPY . .

# Mở port mà ứng dụng sẽ chạy
EXPOSE 3000

# Chạy ứng dụng
CMD [ "node", "dist/main.js" ]