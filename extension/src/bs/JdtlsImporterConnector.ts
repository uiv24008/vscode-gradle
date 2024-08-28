import * as net from "net";
import * as rpc from "vscode-jsonrpc/node";
import * as vscode from "vscode";
import * as path from "path";
import { sendInfo } from "vscode-extension-telemetry-wrapper";

export const ON_WILL_IMPORTER_CONNECT = "_gradle.onWillImporterConnect";

/**
 * Receive the pipe name from Java jdt.ls importer, generate named pipe file and
 * setting up a pipe server that will be used to communicate with the importer
 */
export class JdtlsImporterConnector {
    private importerConnection: rpc.MessageConnection | null = null;
    private importerPipeServer: net.Server;
    private importerPipePath: string;
    private setPipePathPromise: Promise<void> | null = null;
    private readonly _onImporterReady: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();

    constructor(private readonly context: vscode.ExtensionContext) {
        this.registerCommand();
    }

    /**
     * Waits for the importer pipe path to be ready.
     * It listens for the `_onImporterReady` event, and when the event is fired,
     * it updates the `importerPipePath` with the resolved path and resolves the Promise.
     *
     * @returns Promise that resolves when the pipe path is ready
     */
    public async waitForImporterPipePath(): Promise<void> {
        await this.setPipePathPromise;
    }

    /**
     * The `_onPipePathReady` event will be fired when the pipe path is received from Java jdt.ls importer
     */
    private registerCommand(): void {
        this.setPipePathPromise = new Promise((resolve) => {
            this._onImporterReady.event((resolvedPath) => {
                this.importerPipePath = resolvedPath;
                sendInfo("", {
                    kind: "JdtlsImporterConnectorReceivedPipePath",
                });
                resolve();
            });
        });
        this.context.subscriptions.push(
            vscode.commands.registerCommand(ON_WILL_IMPORTER_CONNECT, (pipeName: string) => {
                this._onImporterReady.fire(path.resolve(pipeName));
            })
        );
    }

    public async setupImporterPipeStream(): Promise<void> {
        return new Promise((resolve) => {
            this.importerPipeServer = net.createServer((socket: net.Socket) => {
                this.importerConnection = rpc.createMessageConnection(
                    new rpc.StreamMessageReader(socket),
                    new rpc.StreamMessageWriter(socket)
                );
                resolve();
            });
            this.importerPipeServer.on("error", (error) => {
                sendInfo("", {
                    kind: "JdtlsImporterConnectorError",
                    error: error.message,
                    proxyErrorStack: error.stack ? error.stack.toString() : "",
                });
            });
            this.importerPipeServer.listen(this.importerPipePath);
        });
    }

    public startListening(): void {
        this.importerConnection!.listen();
    }

    public getImporterConnection(): rpc.MessageConnection | null {
        return this.importerConnection;
    }

    public close(): void {
        this.importerConnection?.end();
        this.importerConnection?.dispose();
        this.importerPipeServer.close();
    }
}
