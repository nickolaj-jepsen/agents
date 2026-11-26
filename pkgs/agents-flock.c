/*
 * agents-flock: hold an exclusive flock(2) on a file for as long as stdin stays open.
 *
 * The kernel owns this lock the way it always has: it survives Node's lack of a flock binding, it
 * is released when this process dies (a caller that crashed closes the pipe, this reads EOF and
 * exits), and it excludes every other flock(2) on the same inode — including an older Python
 * `agents` holding `fcntl.flock` on the same file.
 *
 * usage: agents-flock PATH TIMEOUT_SECONDS [POLL_SECONDS]
 *   TIMEOUT_SECONDS < 0 waits forever.
 *   stdout: "waiting" once when the lock was busy, then "locked".
 *   exit:   0 on release, 75 when the wait ran out, 1 on an error.
 */
#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <fcntl.h>
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

int main(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "usage: %s PATH TIMEOUT_SECONDS [POLL_SECONDS]\n", argv[0]);
    return 2;
  }
  const char *path = argv[1];
  char *end = NULL;
  double timeout = strtod(argv[2], &end);
  if (end == argv[2] || *end != '\0') {
    fprintf(stderr, "agents-flock: bad timeout %s\n", argv[2]);
    return 2;
  }
  double poll = 0.1;
  if (argc > 3) {
    poll = strtod(argv[3], &end);
    if (end == argv[3] || *end != '\0' || poll <= 0) {
      fprintf(stderr, "agents-flock: bad poll %s\n", argv[3]);
      return 2;
    }
  }

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
    double left = deadline < 0 ? poll : deadline - monotonic();
    if (deadline >= 0 && left <= 0) {
      close(fd);
      return 75;
    }
    double nap = (deadline < 0 || left > poll) ? poll : left;
    if (nap > 0) {
      struct timespec pause;
      pause.tv_sec = (time_t)nap;
      pause.tv_nsec = (long)((nap - (double)pause.tv_sec) * 1e9);
      if (pause.tv_nsec < 0) pause.tv_nsec = 0;
      nanosleep(&pause, NULL);
    }
  }

  if (!say("locked\n")) {
    close(fd);
    return 1;
  }

  /* Hold the lock until the caller closes the pipe: reading EOF is the release signal. */
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
