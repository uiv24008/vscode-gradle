import * as net from "net";
import * as rpc from "vscode-jsonrpc/node";
import { getRandomPipeName } from "../util/generateRandomPipeName";
import { sendInfo } from "vscode-extension-telemetry-wrapper";

/**
 * Creates a named pipe file and sets up a pipe server
 * for communication with the build server.
 */
export class BuildServerConnector {
    private serverConnection: rpc.MessageConnection | null = null;
    private serverPipeServer: net.Server;
    private serverPipePath: string;

    /**
     * Generates a random pipe name, creates a pipe server and
     * waiting for the connection from the Java build server.
     */
    public setupBuildServerPipeStream(): boolean {
        this.serverPipePath = getRandomPipeName();
        if (this.serverPipePath === "") {
            return false;
        }
        this.serverPipeServer = net.createServer((socket: net.Socket) => {
            this.serverConnection = rpc.createMessageConnection(
                new rpc.StreamMessageReader(socket),
                new rpc.StreamMessageWriter(socket)
            );
            this.serverConnection.onError((error: any) => {
                sendInfo("", {
                    kind: "BuildServerConnectorRpcError",
                    error: error?.message,
                    proxyErrorStack: error?.stack ? error.stack.toString() : "",
                });
            });
            this.serverConnection.listen();
        });
        this.serverPipeServer.on("error", (error) => {
            sendInfo("", {
                kind: "BuildServerConnectorError",
                error: error.message,
                proxyErrorStack: error.stack ? error.stack.toString() : "",
            });
        });
        this.serverPipeServer.listen(this.serverPipePath);
        return true;
    }

    public getServerConnection(): rpc.MessageConnection | null {
        return this.serverConnection;
    }

    public getServerPipePath(): string {
        return this.serverPipePath;
    }

    public close(): void {
        this.serverConnection?.end();
        this.serverConnection?.dispose();
        this.serverPipeServer.close();
    }
}
