CREATE TABLE IF NOT EXISTS LabQuizzes (
  id TEXT PRIMARY KEY, groupId TEXT NOT NULL, title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'hidden', questions TEXT NOT NULL,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lab_quizzes_group ON LabQuizzes(groupId, status);
CREATE TABLE IF NOT EXISTS LabQuizAttempts (
  id TEXT PRIMARY KEY, quizId TEXT NOT NULL, groupId TEXT NOT NULL,
  studentId TEXT NOT NULL, answers TEXT NOT NULL, grading TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', version INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
  UNIQUE(quizId, studentId)
);
CREATE INDEX IF NOT EXISTS lab_quiz_attempts_group ON LabQuizAttempts(groupId, quizId, status);
