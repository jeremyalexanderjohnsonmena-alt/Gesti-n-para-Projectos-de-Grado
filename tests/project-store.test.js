import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  filterProjectsForStudent,
  updateAssignedStudentSignature,
} from '../project-store.js';

test('filters projects by assigned student account regardless of username casing', () => {
  const records = [
    { projects: [
      { id: 'project-a', studentUsernames: ['student.one'] },
      { id: 'project-b', studentUsernames: ['student.two'] },
    ] },
    { projects: [{ id: 'project-c', studentUsernames: ['STUDENT.ONE', 'student.two'] }] },
    { projects: 'invalid' },
  ];

  assert.deepEqual(
    filterProjectsForStudent(records, 'Student.One').map((project) => project.id),
    ['project-a', 'project-c'],
  );
});

test('does not expose legacy or unassigned projects to students', () => {
  const projects = filterProjectsForStudent([
    { projects: [{ id: 'legacy-project' }, { id: 'unassigned-project', studentUsernames: [] }] },
  ], 'student.one');

  assert.deepEqual(projects, []);
});

test('updates a signature only for the assigned student and preserves other projects', () => {
  const records = [{
    username: 'teacher.one',
    projects: [
      {
        id: 'project-a',
        students: ['student-a', 'student-b'],
        studentUsernames: ['student.one'],
        sessions: [{ id: 'session-a', studentSignature: '', studentSignatures: {} }],
      },
      { id: 'project-b', students: [], studentUsernames: [], sessions: [] },
    ],
  }];

  const update = updateAssignedStudentSignature(records, {
    username: 'STUDENT.ONE',
    projectId: 'project-a',
    sessionId: 'session-a',
    studentId: 'student-a',
    signature: 'Student Signature',
  });

  assert.equal(update.ownerUsername, 'teacher.one');
  assert.equal(update.projects[0].sessions[0].studentSignatures['student-a'], 'Student Signature');
  assert.deepEqual(update.projects[1], records[0].projects[1]);
  assert.equal(records[0].projects[0].sessions[0].studentSignatures['student-a'], undefined);
});

test('does not update signatures for unassigned users or unrelated project participants', () => {
  const records = [{
    username: 'teacher.one',
    projects: [{
      id: 'project-a',
      students: ['student-a'],
      studentUsernames: ['student.one'],
      sessions: [{ id: 'session-a' }],
    }],
  }];
  const baseRequest = {
    username: 'other-student',
    projectId: 'project-a',
    sessionId: 'session-a',
    studentId: 'student-a',
    signature: 'Forged',
  };

  assert.equal(updateAssignedStudentSignature(records, baseRequest), null);
  assert.equal(updateAssignedStudentSignature(records, { ...baseRequest, username: 'student.one', studentId: 'student-b' }), null);
});
