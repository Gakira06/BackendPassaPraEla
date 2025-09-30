from flask import Flask, send_file
from flask_cors import CORS # // NOVA LINHA
import numpy as np
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression
import io
import os

app = Flask(__name__)
CORS(app) # // NOVA LINHA: Habilita o CORS para toda a aplicação

@app.route('/generate-plot', methods=['GET'])
def generate_plot():
    # A sua lógica de criação de gráfico permanece aqui
    np.random.seed(0)
    X = np.random.rand(50, 1) * 10
    y = 2 * X.squeeze() + 1 + np.random.randn(50) * 2
    model = LinearRegression()
    model.fit(X, y)
    y_pred = model.predict(X)

    plt.figure(figsize=(10, 6))
    plt.scatter(X, y, color='blue', label='Dados Reais')
    plt.plot(X, y_pred, color='red', linewidth=2, label='Linha de Regressão')
    plt.title('Análise de Desempenho da Jogadora')
    plt.xlabel('Métricas')
    plt.ylabel('Pontuação')
    plt.legend()
    plt.grid(True)

    # Guarda a imagem num buffer em memória em vez de num ficheiro
    img_buffer = io.BytesIO()
    plt.savefig(img_buffer, format='png')
    img_buffer.seek(0)
    plt.clf()

    return send_file(img_buffer, mimetype='image/png')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port)