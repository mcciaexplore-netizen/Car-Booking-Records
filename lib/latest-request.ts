/** Coordinates cancellable reads. A server that ignores abort still cannot win an older request. */
export class LatestRequest<T> {
  private generation = 0;
  private controller: AbortController | null = null;
  cancel() {
    this.generation++;
    this.controller?.abort();
  }
  async run(
    read: (signal: AbortSignal) => Promise<T>,
    success: (value: T) => void,
    failure: (error: unknown) => void,
    settled: () => void,
  ) {
    this.controller?.abort();
    const controller = new AbortController(),
      generation = ++this.generation;
    this.controller = controller;
    try {
      const value = await read(controller.signal);
      if (generation === this.generation && !controller.signal.aborted)
        success(value);
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted)
        failure(error);
    } finally {
      if (generation === this.generation) settled();
    }
  }
}
