const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../db');
const Todo = require('../models/todo');
const { requireWebAuth } = require('../utils/webAuth');

function serializeTodo(todo) {
  return {
    id: todo._id.toString(),
    title: todo.title,
    note: todo.note || '',
    dueAt: new Date(todo.dueAt).toISOString(),
    done: Boolean(todo.done),
    doneAt: todo.doneAt ? new Date(todo.doneAt).toISOString() : null,
    createdAt: todo.createdAt ? new Date(todo.createdAt).toISOString() : null,
  };
}

function parseDate(value, label) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error('Geçersiz ' + label + '.');
  return date;
}

function parseTodoInput(body = {}, partial = false) {
  const input = {};
  if (!partial || body.title !== undefined) {
    const title = String(body.title || '').trim();
    if (!title || title.length > 160) throw new Error('Not başlığı 1-160 karakter olmalı.');
    input.title = title;
  }
  if (!partial || body.note !== undefined) input.note = String(body.note || '').trim().slice(0, 600);
  if (!partial || body.dueAt !== undefined) input.dueAt = parseDate(body.dueAt, 'tarih');
  return input;
}

module.exports = async (req, res) => {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireWebAuth(req, res)) return;

  try {
    if (mongoose.connection.readyState !== 1) await connectDB();

    if (req.method === 'GET') {
      // Takvim ayını istemci kendi saat diliminde hesaplayıp gönderir.
      const from = parseDate(req.query.from, 'başlangıç');
      const to = parseDate(req.query.to, 'bitiş');
      const [items, upcoming] = await Promise.all([
        Todo.find({ dueAt: { $gte: from, $lt: to } }).sort({ dueAt: 1 }),
        Todo.find({ done: false }).sort({ dueAt: 1 }).limit(30),
      ]);
      return res.status(200).json({
        todos: items.map(serializeTodo),
        upcoming: upcoming.map(serializeTodo),
      });
    }

    if (req.method === 'POST') {
      const todo = await Todo.create(parseTodoInput(req.body));
      return res.status(201).json({ todo: serializeTodo(todo) });
    }

    const id = String(req.query.id || req.body?.id || '').trim();
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Geçersiz not kimliği.' });
    const todo = await Todo.findById(id);
    if (!todo) return res.status(404).json({ error: 'Not bulunamadı.' });

    if (req.method === 'DELETE') {
      await todo.deleteOne();
      return res.status(200).json({ todo: serializeTodo(todo) });
    }

    Object.assign(todo, parseTodoInput(req.body, true));
    if (req.body?.done !== undefined) {
      todo.done = Boolean(req.body.done);
      todo.doneAt = todo.done ? new Date() : null;
    }
    await todo.save();
    return res.status(200).json({ todo: serializeTodo(todo) });
  } catch (error) {
    console.error('Todos API error:', error);
    const status = /olmalı|Geçersiz/.test(error.message || '') ? 400 : 500;
    return res.status(status).json({ error: error.message || 'Not işlemi başarısız.' });
  }
};
