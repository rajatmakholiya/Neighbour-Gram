import { WebSocketServer } from 'ws';

const PORT = 8080;

const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket server started on port ${PORT}`);

wss.on('connection', (ws) => {
    console.log('A new client connected!');

    ws.on('message', (message) => {
        console.log('Received message =>', message.toString());

        wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === ws.OPEN) {
                client.send(message.toString());
            }
        });
    });

    ws.on('close', () => {
        console.log('A client disconnected.');
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});