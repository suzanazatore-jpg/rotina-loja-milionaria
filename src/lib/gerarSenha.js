// src/lib/gerarSenha.js
//
// Gera uma senha numérica aleatória de 6 dígitos (ex: "483920"),
// usada quando uma nova aluna chega via webhook do Guru (sem passar
// pelo cadastro manual, onde a senha é escolhida pelo admin).

export function gerarSenhaNumerica() {
  // Garante 6 dígitos, incluindo zeros à esquerda (ex: 003920)
  const numero = Math.floor(Math.random() * 1000000);
  return numero.toString().padStart(6, '0');
}