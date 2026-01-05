const { docker } = require('./docker');

/**
 * Exec a command inside a container and return stdout/stderr.
 *
 * IMPORTANT: This must never hang. Always use a hard timeout and destroy the stream
 * on timeout to avoid leaking exec streams.
 */
async function execInContainer(container, cmd, timeoutMs) {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({ Detach: false });

  const stdoutChunks = [];
  const stderrChunks = [];

  let finished = false;

  const result = await new Promise((resolve, reject) => {
    const onEnd = () => {
      if (finished) return;
      finished = true;
      resolve();
    };

    const onError = (err) => {
      if (finished) return;
      finished = true;
      reject(err);
    };

    // demuxStream writes to provided "streams". We only need to accumulate bytes.
    docker.modem.demuxStream(
      stream,
      { write: (chunk) => stdoutChunks.push(chunk) },
      { write: (chunk) => stderrChunks.push(chunk) }
    );

    stream.on('end', onEnd);
    stream.on('error', onError);

    const t = setTimeout(() => {
      if (finished) return;
      finished = true;
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      try {
        // Best-effort: ensure the stream does not keep the event loop alive.
        stream.destroy();
      } catch (_) {}
      reject(new Error(`Exec timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    // If we finish before timeout, clear it.
    const clear = () => clearTimeout(t);
    stream.once('end', clear);
    stream.once('error', clear);
  });

  return {
    stdout: Buffer.concat(stdoutChunks).toString().trim(),
    stderr: Buffer.concat(stderrChunks).toString().trim(),
    result,
  };
}

module.exports = {
  execInContainer,
};


