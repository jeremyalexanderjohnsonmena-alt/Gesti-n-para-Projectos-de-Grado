import jwt from 'jsonwebtoken';

/**
 * Middleware para verificar la validez del token JWT en las solicitudes protegidas.
 * Si el token es válido, inyecta la información del usuario en `req.user`.
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  const secret = process.env.JWT_SECRET || 'super_secreto_asesorias_grado_token_key_2026';

  jwt.verify(token, secret, (err, user) => {
    if (err) {
      console.error('JWT error de verificación:', err.message);
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }

    req.user = user;
    next();
  });
};

export default authenticateToken;
