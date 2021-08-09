import React from 'react';
import ReactDOM from 'react-dom';
import * as io from 'socket.io-client';

const socket = io();

socket.on('who_are_you', () => {
    const whom = prompt('Who are you?')
    socket.emit('set_from', whom);
});

ReactDOM.render(<App />, document.getElementById('app'));
