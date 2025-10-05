-- Serve so para organização de montagem não esta sendo usada para o produto em si

CREATE TABLE jogadoras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome VARCHAR(255) NOT NULL,
    numero_camisa INT NOT NULL,
    posicao VARCHAR(50) NOT NULL,
    url_imagem VARCHAR(255) NOT NULL
);

INSERT INTO jogadoras (nome, numero_camisa, posicao, url_imagem) VALUES
('Letícia Izidoro (Lelê)', 1, 'Goleira', '/players/leticiaIzidoro.jpg'),
('Antônia', 2, 'Lateral-Direita', '/players/antoniaSilva.jpg'),
('Rafaelle Souza', 4, 'Zagueira', '/players/rafaelleSouza.png'),
('Lauren', 3, 'Zagueira', '/players/lauren.jpg'),
('Tamires', 6, 'Lateral-Esquerda', '/players/tamires.jpg'),
('Angelina', 8, 'Meio-campista', '/players/Angelina.webp'),
('Ary Borges', 17, 'Meio-campista', '/players/aryBorges.webp'),
('Kerolin', 21, 'Meia-Atacante', '/players/kerolin.jpg'),
('Adriana Leal', 11, 'Atacante', '/players/adrianaLeal.jpg'),
('Geyse Ferreira', 18, 'Atacante', '/players/geyseFerreira.jpg'),
('Debinha', 9, 'Atacante', '/players/debinha.webp');
