import {Connection, Socket} from 'battleye';

const playerConnectRegex = /Player #\d+ (.+) \((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?):([0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])\) connected/
const playerDisconnectRegex = /^Player #\d+ (.+) disconnected$/;

export type PlayerCallback = (playerName: string, playerCount: number) => void;

export class BattlEyeClient {
    private socket: Socket;
    private connection: Connection;
    private connectListeners: PlayerCallback[] = [];
    private disconnectListeners: PlayerCallback[] = [];

    constructor(host: string, port: number, password: string) {
        this.socket = new Socket({
            ip: '0.0.0.0',
            port: 2310,
        });
        this.connection = this.socket.connection({
            ip: host,
            name: '',
            port,
            password,
        }, {
            reconnect: true,
            reconnectTimeout: 500,
            keepAlive: true,
            keepAliveInterval: 15000,
            timeout: true,
            timeoutInterval: 1000,
            serverTimeout: 30000,
            packetTimeout: 1000,
            packetTimeoutThresholded: 5,
        });
        this.connection.on('message', (message) => {
            this.onMessage(message)
        });
        this.connection.on('error', (error) => {
            console.log('Error in RCon connection: ' + error);
        });
    }

    public on(event: 'playerConnect' | 'playerDisconnect', listener: PlayerCallback): BattlEyeClient {
        switch (event) {
            case 'playerConnect':
                this.connectListeners.push(listener);
                break;
            case 'playerDisconnect':
                this.disconnectListeners.push(listener);
                break;
        }
        return this;
    }

    public disconnect() {
        this.connection.kill(new Error('user requested'));
    }

    private onMessage(message: string) {
        const connect = message.match(playerConnectRegex);
        if (connect !== null) {
            this.connectListeners.forEach(async (callback) => {
                callback(connect!![1], await this.playerCount());
            });
        }
        const disconnect = message.match(playerDisconnectRegex);
        if (disconnect !== null) {
            this.disconnectListeners.forEach(async (callback) => {
                callback(disconnect!![1], await this.playerCount());
            });
        }
    }

    private async playerCount(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.connection.command('players').then(response => {
                const output = response.data?.split(/\r?\n/);
                if (output === undefined) {
                    return resolve(0);
                }
                const count = output[output.length - 1].match(/\d+/g);
                if (count === null) {
                    return resolve(0);
                }
                resolve(parseInt(count[0]));
            }).catch(() => {
                console.error('An error occurred while fetching current player count');
                reject();
            });
        });
    }
}