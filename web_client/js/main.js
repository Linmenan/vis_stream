// web_client/js/main.js
console.log("VisStream client starting...");

// 指向我们生成的Protobuf类
const { TestMessage } = proto.vis_stream;

const socket = new WebSocket('ws://localhost:9002');
// 告诉WebSocket接收二进制数据为 ArrayBuffer
socket.binaryType = 'arraybuffer';

socket.onopen = function (event) {
    console.log("Successfully connected to the WebSocket server.");
};

socket.onmessage = function (event) {
    console.log("Binary message received from server.");
    try {
        // event.data 现在是 ArrayBuffer
        // 使用 .deserializeBinary 方法解析它
        const message = TestMessage.deserializeBinary(event.data);

        // 调用 .getContent() 方法获取字段值
        console.log("Decoded Protobuf message content:", message.getContent());

    } catch (e) {
        console.error("Error deserializing binary message:", e);
    }
};

// ... (onclose 和 onerror 保持不变) ...