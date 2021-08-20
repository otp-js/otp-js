import socketio from 'socket.io';
import * as http from 'http';
import Koa from 'koa';
import koaStatic from 'koa-static';
import koaLogger from 'koa-logger';
import * as otp from '@otpjs/core';
import * as supervisor from './supervisor';
import path from 'path';

const PORT = process.env.PORT || 8080;
const { EXIT, trap_exit } = otp.Symbols;

const app = new Koa();
const httpServer = http.createServer(app);
const io = socketio(httpServer);

const node = new otp.Node();
node.spawn(async ctx => {
    ctx.processFlag(trap_exit, true);
    const [, pid] = supervisor.startLink(ctx, io);
    await receive([EXIT, pid, _, _]);
})

app.use(koaLogger());
app.use(koaStatic(path.resolve(process.cwd(), 'client')));

console.log('httpServer.listen(%d)', PORT);
app.listen(PORT);
