const express = require('express');
const app = express();
app.use(express.json());

app.get('/api/auth', (req, res) => res.json({ message: 'Auth Service Running' }));
app.get('/api/users', (req, res) => res.json({ users: ['User1', 'User2'] }));
app.get('/api/products', (req, res) => res.json({ products: ['Product1', 'Product2'] }));
app.get('/api/orders', (req, res) => res.json({ orders: ['Order1', 'Order2'] }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Mock service running on port ${PORT}`));
