import { createServer } from "http";
import { createApp } from "./app";
import { initSockets } from "./sockets/index";
import { config } from "./config";

const app = createApp();
const server = createServer(app);
initSockets(server);

server.listen(config.port, () => {
  console.log(`Locksmith API listening on port ${config.port}`);
});
