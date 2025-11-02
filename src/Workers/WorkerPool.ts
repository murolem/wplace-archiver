import { AsyncResource } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

const kTaskInfo = Symbol('kTaskInfo');
const kWorkerFreedEvent = Symbol('kWorkerFreedEvent');

export type WorkerTaskDoneCallback = (err: unknown, result: unknown) => void;
export type PooledWorker = Worker & {
    [kTaskInfo]: WorkerPoolTaskInfo | null
}

class WorkerPoolTaskInfo extends AsyncResource {
    private callback: WorkerTaskDoneCallback;

    constructor(callback: WorkerTaskDoneCallback) {
        super('WorkerPoolTaskInfo');
        this.callback = callback;
    }

    done(err: unknown, result: unknown) {
        this.runInAsyncScope(this.callback, null, err, result);
        this.emitDestroy();  // `TaskInfo`s are used only once.
    }
}

export default class WorkerPool<TJobData = unknown> extends EventEmitter {
    private jobScriptPath: string;
    private numThreads: number;
    private workers: PooledWorker[];
    private freeWorkers: PooledWorker[];
    private tasks: { task: unknown, callback: WorkerTaskDoneCallback }[];

    constructor(jobScriptPath: string, numThreads: number) {
        super();
        this.jobScriptPath = jobScriptPath;
        this.numThreads = numThreads;
        this.workers = [];
        this.freeWorkers = [];
        this.tasks = [];

        for (let i = 0; i < numThreads; i++)
            this.addNewWorker();

        // Any time the kWorkerFreedEvent is emitted, dispatch
        // the next task pending in the queue, if any.
        this.on(kWorkerFreedEvent, () => {
            if (this.tasks.length > 0) {
                const { task, callback } = this.tasks.shift()!;
                this.runTask(task as TJobData)
                    .then(res => callback(null, res))
                    .catch(err => callback(err, null));
            }
        });
    }

    private addNewWorker() {
        const worker = new Worker(path.resolve(this.jobScriptPath)) as PooledWorker;
        worker[kTaskInfo] = null;

        worker.on('message', (result) => {
            // In case of success: Call the callback that was passed to `runTask`,
            // remove the `TaskInfo` associated with the Worker, and mark it as free
            // again.
            worker[kTaskInfo]!.done(null, result);
            worker[kTaskInfo] = null;
            this.freeWorkers.push(worker);
            this.emit(kWorkerFreedEvent);
        });
        worker.on('error', (err) => {
            // In case of an uncaught exception: Call the callback that was passed to
            // `runTask` with the error.
            if (worker[kTaskInfo])
                worker[kTaskInfo].done(err, null);
            else
                this.emit('error', err);
            // Remove the worker from the list and start a new Worker to replace the
            // current one.
            this.workers.splice(this.workers.indexOf(worker), 1);
            this.addNewWorker();
        });
        this.workers.push(worker);
        this.freeWorkers.push(worker);
        this.emit(kWorkerFreedEvent);
    }

    // runTask(task: unknown, callback: WorkerTaskDoneCallback) {
    //     if (this.freeWorkers.length === 0) {
    //         // No free threads, wait until a worker thread becomes free.
    //         this.tasks.push({ task, callback });
    //         return;
    //     }

    //     const worker = this.freeWorkers.pop()!;
    //     worker[kTaskInfo] = new WorkerPoolTaskInfo(callback);
    //     worker.postMessage(task);
    // }

    runTask(jobData: TJobData): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const callback: WorkerTaskDoneCallback = (err, res) => {
                if (err)
                    reject(err);
                else
                    resolve(res);
            }

            if (this.freeWorkers.length === 0) {
                // No free threads, wait until a worker thread becomes free.
                this.tasks.push({ task: jobData, callback });
                return;
            }

            const worker = this.freeWorkers.pop()!;
            worker[kTaskInfo] = new WorkerPoolTaskInfo(callback);
            worker.postMessage(jobData);
        })
    }

    close() {
        for (const worker of this.workers) worker.terminate();
    }
}