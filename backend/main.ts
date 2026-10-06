import "dotenv/config";
import {createBackend} from "./bootstrap.js";
const {app}=await createBackend();
await app.listen(Number(process.env.BACKEND_PORT||3001),process.env.BACKEND_HOST||"127.0.0.1");
console.log("VillaCheck NestJS API listening on port",process.env.BACKEND_PORT||3001);
