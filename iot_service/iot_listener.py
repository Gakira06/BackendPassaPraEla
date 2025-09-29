
import paho.mqtt.client as mqtt
import requests
import json

# --- CONFIGURAÇÕES ---
# Estas definições devem ser EXATAMENTE as mesmas que você configurou no seu código do Wokwi.
MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
MQTT_TOPIC = "passapraela/stats/jogadora1" # Tópico que o ESP32 está a publicar

# URL do seu backend principal (Node.js) que está a correr localmente.
# O {} será substituído pelo ID da jogadora.
API_URL = "http://localhost:3001/jogadoras/{}/stats-fisicas" 

# --- FUNÇÕES CALLBACK DO MQTT ---

# Esta função é chamada quando o script se conecta com sucesso ao broker MQTT.
def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("✅ Conectado ao Broker MQTT!")
        # Após conectar, o script "assina" o tópico para começar a receber mensagens.
        client.subscribe(MQTT_TOPIC)
        print(f"📡 A escutar no tópico: {MQTT_TOPIC}")
    else:
        # Se houver um erro na conexão (senha errada, etc.), ele será mostrado aqui.
        print(f"❌ Falha na conexão com o MQTT, código de retorno: {rc}")

# Esta função é chamada TODA VEZ que uma nova mensagem chega no tópico que assinamos.
def on_message(client, userdata, msg):
    print(f"\n📩 Mensagem recebida de `{msg.topic}`")
    # A mensagem chega como bytes, então a descodificamos para uma string.
    payload = msg.payload.decode()
    print(f"   Payload: {payload}")

    try:
        # Converte a string JSON para um dicionário Python para podermos usar os dados.
        data = json.loads(payload)
        
        player_id = data.get("idJogadora")
        passos = data.get("passos")
        distancia = data.get("distanciaMetros")
        
        # Se a mensagem tiver um ID de jogadora, continua o processo.
        if player_id:
            # Prepara a URL final e os dados a serem enviados para o backend Node.js.
            url_destino = API_URL.format(player_id)
            dados_para_enviar = {
                "passos": passos,
                "distanciaMetros": distancia
            }
            
            print(f"   A enviar dados para a API principal: {url_destino}")
            
            # Usa a biblioteca 'requests' para fazer um pedido POST para o seu server.js
            response = requests.post(url_destino, json=dados_para_enviar)
            
            # Verifica se o pedido à API foi bem-sucedido.
            if response.status_code == 200:
                print(f"   ✅ Sucesso! O backend Node.js atualizou os dados.")
            else:
                print(f"   ❌ Erro ao contactar a API principal: {response.status_code} - {response.text}")

    except Exception as e:
        print(f"   ❌ Erro ao processar a mensagem JSON ou ao enviar para a API: {e}")

# --- PROGRAMA PRINCIPAL ---

# 1. Cria o cliente MQTT.
# Usamos a V2 da API de callback, que é a mais recente.
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

# 2. Associa as nossas funções aos eventos do cliente.
client.on_connect = on_connect
client.on_message = on_message

# 3. Tenta conectar-se ao broker.
print("[STATUS] A inicializar o serviço de IoT...")
try:
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
except Exception as e:
    print(f"Não foi possível conectar ao broker MQTT: {e}")
    exit()

# 4. Inicia um loop infinito que mantém o script a rodar e a escutar por novas mensagens.
# Este comando bloqueia o terminal, o que é o comportamento esperado.
client.loop_forever()