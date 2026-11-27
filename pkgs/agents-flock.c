/*
 * agents-flock: hold an exclusive flock(2) on a file until the pipe on stdin closes.
 *
 * The kernel owns this lock the way it always has: it survives Node's lack of a flock binding, and
 * it excludes every other flock(2) on the same inode — including an older Python `agents` holding
 * `fcntl.flock` on the same file.
 *
 * The parent decides when the lock is released: it closes the pipe, and only then does this exit.
 * Terminal signals (Ctrl+C, Ctrl+\, a hangup) reach this process too, because a terminal delivers
 * them to the whole process group; they are ignored on purpose, so a Ctrl+C cannot free the lock
 * while the parent is still cleaning up. If the parent dies — any cause, including SIGKILL — the
 * kernel closes the pipe, which is the same release signal. That also holds while this is still
 * waiting: the wait polls stdin, so a waiter never outlives the process that asked for it.
 *
 * usage: agents-flock PATH TIMEOUT_SECONDS [POLL_SECONDS]
 *   TIMEOUT_SECONDS  a number of seconds, +infinity, or exactly -1 to wait forever.
 *   stdout: "waiting" once when the lock was busy, then "locked".
 *   exit:   0 released, 75 the wait ran out, 76 stdin closed while waiting, 1 error, 2 usage.
 */
#define _POSIX_C_SOURCE 200809L
/* _POSIX_C_SOURCE alone hides every BSD extension in Darwin's headers, flock(2) and LOCK_* with
 * it; _DARWIN_C_SOURCE puts them back without giving up the POSIX declarations. */
#ifdef __APPLE__
#define _DARWIN_C_SOURCE
#endif

#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <time.h>
#include <unistd.h>

static double monotonic(void) {
  struct timespec now;
  clock_gettime(CLOCK_MONOTONIC, &now);
  return (double)now.tv_sec + (double)now.tv_nsec / 1e9;
}

static int say(const char *line) {
  if (fputs(line, stdout) == EOF) return 0;
  return fflush(stdout) != EOF;
}

/* Has the parent closed the pipe, or written to it? Either one means "stop waiting". */
static int stdin_closed(void) {
  struct pollfd watcher = {.fd = STDIN_FILENO, .events = POLLIN};
  int ready = poll(&watcher, 1, 0);
  if (ready <= 0) return 0;
  char byte;
  ssize_t got = read(STDIN_FILENO, &byte, 1);
  if (got == 0) return 1;
  if (got > 0) return 1;
  return errno != EINTR && errno != EAGAIN;
}

int main(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "usage: %s PATH TIMEOUT_SECONDS [POLL_SECONDS]\n", argv[0]);
    return 2;
  }
  const char *path = argv[1];
  char *end = NULL;
  double timeout = strtod(argv[2], &end);
  if (end == argv[2] || *end != '\0' || (timeout < 0 && timeout != -1)) {
    fprintf(stderr, "agents-flock: bad timeout %s\n", argv[2]);
    return 2;
  }
  double interval = 0.1;
  if (argc > 3) {
    interval = strtod(argv[3], &end);
    if (end == argv[3] || *end != '\0' || interval <= 0) {
      fprintf(stderr, "agents-flock: bad poll %s\n", argv[3]);
      return 2;
    }
  }

  /* The parent's cleanup owns the release: a terminal signal must not take the lock away early. */
  signal(SIGINT, SIG_IGN);
  signal(SIGTERM, SIG_IGN);
  signal(SIGHUP, SIG_IGN);
  signal(SIGQUIT, SIG_IGN);

  /* Never unlink the file: a contender may already be waiting on that inode. */
  int fd = open(path, O_RDWR | O_CREAT | O_CLOEXEC, 0644);
  if (fd < 0) {
    fprintf(stderr, "agents-flock: %s: %s\n", path, strerror(errno));
    return 1;
  }

  int waited = 0;
  double deadline = timeout < 0 ? -1 : monotonic() + timeout;
  for (;;) {
    if (flock(fd, LOCK_EX | LOCK_NB) == 0) break;
    if (errno == EINTR) continue;
    if (errno != EWOULDBLOCK && errno != EAGAIN) {
      fprintf(stderr, "agents-flock: %s: %s\n", path, strerror(errno));
      close(fd);
      return 1;
    }
    if (!waited) {
      if (!say("waiting\n")) {
        close(fd);
        return 1;
      }
      waited = 1;
    }
    double left = deadline < 0 ? interval : deadline - monotonic();
    if (deadline >= 0 && left <= 0) {
      close(fd);
      return 75;
    }
    double nap = (deadline < 0 || left > interval) ? interval : left;
    if (nap > 0) {
      /* Sleep on the pipe, not blindly: a parent that dies while we wait must not orphan us. */
      struct pollfd pipe = {.fd = STDIN_FILENO, .events = POLLIN};
      int milliseconds = (int)(nap * 1000.0);
      if (milliseconds < 1) milliseconds = 1;
      int ready = poll(&pipe, 1, milliseconds);
      if (ready > 0 && stdin_closed()) {
        close(fd);
        return 76;
      }
    }
  }

  if (!say("locked\n")) {
    close(fd);
    return 1;
  }

  /* Hold the lock until the parent closes the pipe: EOF is the release signal. */
  char buffer[4096];
  for (;;) {
    ssize_t got = read(STDIN_FILENO, buffer, sizeof buffer);
    if (got > 0) continue;
    if (got == 0) break;
    if (errno == EINTR) continue;
    break;
  }
  close(fd);
  return 0;
}
