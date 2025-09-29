import numpy as np
import matplotlib.pyplot as plt
import io
import base64
import sys

# Deixar todos os gráficos com um visual mais bacana
plt.style.use('seaborn-v0_8-whitegrid')
# Configura o backend para não tentar abrir janelas, apenas renderizar em memória
plt.switch_backend('Agg')

# --- Funções de Simulação ---

def crescimento_exponencial(t, S0, r):
    return S0 * (1 + r)**t

def crescimento_logistico(t, L, k, t0):
    return L / (1 + np.exp(-k * (t - t0)))

def posicao(t, aceleracao):
    # s(t) = (a/2)t² + 2t 
    return (aceleracao / 2) * t**2 + 2 * t

def velocidade_derivada(t, aceleracao):
    # v(t) = at + 2
    return aceleracao * t + 2

# --- Função Principal de Geração de Gráficos (Modificada para Base64) ---

def gerar_grafico_base64(distancia_km_iot=0.0, aceleracao_simulada=6.0):
    # --- Parâmetros ---
    S0_inicial = 5000
    L_limite_logistico = 25000
    
    # --- Dados para as Curvas ---
    tempo_meses = np.arange(0, 37, 1)
    seguidores_exponencial = crescimento_exponencial(tempo_meses, S0_inicial, 0.05)
    tempo_horas = np.linspace(0, 48, 200)
    curtidas_logistico = crescimento_logistico(tempo_horas, L_limite_logistico, 0.3, 12)
    tempo_segundos = np.linspace(0, 5, 100)
    velocidade_arrancada = velocidade_derivada(tempo_segundos, aceleracao_simulada)
    
    # Cálculo da Distância (Integral)
    distancia_integral = (aceleracao_simulada * 5**2 / 2) + (2 * 5)

    # --- 5. Validação: Painel Completo ---
    fig, axs = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('Desempenho em Campo e Engajamento Digital (Visão Completa)', fontsize=20)
    
    # Gráfico 1: Velocidade (Derivada)
    axs[0, 0].plot(tempo_segundos, velocidade_arrancada, color='dodgerblue')
    axs[0, 0].set_title(f'1. Pico de Desempenho (Velocidade) a={aceleracao_simulada:.1f} m/s²')
    axs[0, 0].set_xlabel('Tempo (s)'); axs[0, 0].set_ylabel('Velocidade (m/s)'); axs[0, 0].grid(True)
    
    # Gráfico 2: Distância (Integral)
    axs[0, 1].plot(tempo_segundos, velocidade_arrancada, color='firebrick')
    axs[0, 1].fill_between(tempo_segundos, velocidade_arrancada, color='lightcoral', alpha=0.6)
    axs[0, 1].set_title(f'2. Esforço Total na Arrancada (Integral = {distancia_integral:.2f} m)')
    axs[0, 1].set_xlabel('Tempo (s)'); axs[0, 1].set_ylabel('Velocidade (m/s)'); axs[0, 1].grid(True)
    # Destaque o dado real do IoT
    axs[0, 1].text(0.5, 0.9, f'Distância IoT: {distancia_km_iot:.2f} km', 
                   transform=axs[0, 1].transAxes, 
                   bbox=dict(boxstyle="round,pad=0.3", fc='skyblue', alpha=0.7))
    
    # Gráfico 3: Boom Exponencial
    axs[1, 0].plot(tempo_meses, seguidores_exponencial, color='green')
    axs[1, 0].set_title('3. Boom Inicial de Seguidores (Modelo Exponencial)')
    axs[1, 0].set_xlabel('Tempo (meses)'); axs[1, 0].set_ylabel('Nº de Seguidores'); axs[1, 0].grid(True)
    
    # Gráfico 4: Limite Logístico
    axs[1, 1].plot(tempo_horas, curtidas_logistico, color='purple')
    axs[1, 1].axhline(y=L_limite_logistico, color='grey', linestyle='--')
    axs[1, 1].set_title('4. Engajamento de Longo Prazo (Modelo Logístico)')
    axs[1, 1].set_xlabel('Tempo (horas)'); axs[1, 1].set_ylabel('Nº de Curtidas'); axs[1, 1].grid(True)
    
    plt.tight_layout(rect=[0, 0, 1, 0.96])

    # Salva o gráfico em um buffer e codifica em Base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='svg')
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.read()).decode('utf-8')
    plt.close(fig) 
    
    return img_base64

if __name__ == '__main__':
    # Lê os argumentos (distância e aceleração) passados pelo Node.js
    try:
        distancia_km_iot = float(sys.argv[1])
        aceleracao_simulada = float(sys.argv[2])
    except (IndexError, ValueError):
        distancia_km_iot = 0.0 
        aceleracao_simulada = 6.0 

    # Imprime o Base64 na saída padrão para o Node.js capturar
    print(gerar_grafico_base64(distancia_km_iot, aceleracao_simulada))