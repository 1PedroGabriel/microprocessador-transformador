#include <Arduino.h>
#include <math.h>

// =====================================================
// PINOS
// =====================================================
const int PIN_NTC = A0;
const int PIN_VIBRACAO = A1;
const int PIN_SCT_PRIMARIO = A2;
const int PIN_SCT_SECUNDARIO = A3;

// =====================================================
// SERIAL
// =====================================================
// Se estiver usando Proteus/COMPIM e quiser testar simples, use 9600.
// Para IHM com gráficos mais rápidos, prefira 115200.
const unsigned long SERIAL_BAUD = 9600;

// =====================================================
// ADC
// =====================================================
const float ADC_REF = 5.0;
const float ADC_MAX = 1023.0;

// =====================================================
// CONFIGURAÇÃO DE ENVIO
// =====================================================
const unsigned long INTERVALO_ENVIO_MS = 1000;

// Para RMS dos sinais AC simulados
const int NUM_AMOSTRAS_RMS = 250;
const unsigned int DELAY_AMOSTRA_US = 300;

// =====================================================
// CALIBRAÇÕES SIMULADAS
// =====================================================
float CALIB_CORRENTE_PRIMARIO = 10.0;
float CALIB_CORRENTE_SECUNDARIO = 8.0;
float CALIB_VIBRACAO = 1.0;

// =====================================================
// LIMITES DE ALARME
// =====================================================
const float LIMITE_TEMP_ALERTA = 70.0;
const float LIMITE_TEMP_CRITICO = 85.0;

const float LIMITE_VIB_ALERTA = 0.70;
const float LIMITE_VIB_CRITICO = 0.95;

const float LIMITE_PRIM_ALERTA = 12.0;
const float LIMITE_PRIM_CRITICO = 16.0;

const float LIMITE_SEC_ALERTA = 8.0;
const float LIMITE_SEC_CRITICO = 11.0;

// =====================================================
// CONTROLE
// =====================================================
bool aquisicaoAtiva = true;
bool alarmesReconhecidos = false;

unsigned long ultimoEnvio = 0;
unsigned long sequencia = 0;

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================
float adcParaTensao(int adc) {
  return (adc * ADC_REF) / ADC_MAX;
}

float limitar(float valor, float minimo, float maximo) {
  if (valor < minimo) return minimo;
  if (valor > maximo) return maximo;
  return valor;
}

float mapFloat(float x, float inMin, float inMax, float outMin, float outMax) {
  return (x - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}

// =====================================================
// TEMPERATURA SIMULADA PELO NTC
// =====================================================
float lerTemperaturaNTC() {
  int adc = analogRead(PIN_NTC);
  float tensao = adcParaTensao(adc);

  // Arquivo temperatura_ntc.txt:
  // 3.60 V ≈ 25 °C
  // 2.35 V ≈ 80 °C
  float temperatura = mapFloat(tensao, 3.60, 2.35, 25.0, 80.0);

  return limitar(temperatura, 0.0, 120.0);
}

// =====================================================
// RMS PARA SINAIS CENTRALIZADOS EM 2,5 V
// Usado para vibração e SCTs
// =====================================================
float calcularRMSVolts(int pino) {
  float soma = 0.0;

  for (int i = 0; i < NUM_AMOSTRAS_RMS; i++) {
    soma += analogRead(pino);
    delayMicroseconds(DELAY_AMOSTRA_US);
  }

  float offset = soma / NUM_AMOSTRAS_RMS;

  float somaQuadrados = 0.0;

  for (int i = 0; i < NUM_AMOSTRAS_RMS; i++) {
    float leitura = analogRead(pino);
    float centralizadoADC = leitura - offset;
    float sinalVolts = centralizadoADC * (ADC_REF / ADC_MAX);

    somaQuadrados += sinalVolts * sinalVolts;

    delayMicroseconds(DELAY_AMOSTRA_US);
  }

  return sqrt(somaQuadrados / NUM_AMOSTRAS_RMS);
}

// =====================================================
// ALARME GERAL
// =====================================================
const char* classificarAlarme(
  float temperatura,
  float vibracao,
  float correntePrimario,
  float correnteSecundario
) {
  if (
    temperatura >= LIMITE_TEMP_CRITICO ||
    vibracao >= LIMITE_VIB_CRITICO ||
    correntePrimario >= LIMITE_PRIM_CRITICO ||
    correnteSecundario >= LIMITE_SEC_CRITICO
  ) {
    return "vermelho";
  }

  if (
    temperatura >= LIMITE_TEMP_ALERTA ||
    vibracao >= LIMITE_VIB_ALERTA ||
    correntePrimario >= LIMITE_PRIM_ALERTA ||
    correnteSecundario >= LIMITE_SEC_ALERTA
  ) {
    return "amarelo";
  }

  return "verde";
}

// =====================================================
// ENVIA UM PACOTE JSON COMPLETO POR LINHA
// =====================================================
void enviarPacoteJSON() {
  float temperatura = lerTemperaturaNTC();

  float vibracaoRMS = calcularRMSVolts(PIN_VIBRACAO) * CALIB_VIBRACAO;
  float correntePrimario = calcularRMSVolts(PIN_SCT_PRIMARIO) * CALIB_CORRENTE_PRIMARIO;
  float correnteSecundario = calcularRMSVolts(PIN_SCT_SECUNDARIO) * CALIB_CORRENTE_SECUNDARIO;

  int adcNTC = analogRead(PIN_NTC);
  int adcVibracao = analogRead(PIN_VIBRACAO);
  int adcPrimario = analogRead(PIN_SCT_PRIMARIO);
  int adcSecundario = analogRead(PIN_SCT_SECUNDARIO);

  const char* alarme = classificarAlarme(
    temperatura,
    vibracaoRMS,
    correntePrimario,
    correnteSecundario
  );

  sequencia++;

  Serial.print("{");

  Serial.print("\"type\":\"telemetry\",");
  Serial.print("\"seq\":");
  Serial.print(sequencia);
  Serial.print(",");

  Serial.print("\"ms\":");
  Serial.print(millis());
  Serial.print(",");

  Serial.print("\"aquisicao\":");
  Serial.print(aquisicaoAtiva ? "true" : "false");
  Serial.print(",");

  Serial.print("\"ack\":");
  Serial.print(alarmesReconhecidos ? "true" : "false");
  Serial.print(",");

  Serial.print("\"adc\":{");

  Serial.print("\"ntc\":");
  Serial.print(adcNTC);
  Serial.print(",");

  Serial.print("\"vibracao\":");
  Serial.print(adcVibracao);
  Serial.print(",");

  Serial.print("\"sct_primario\":");
  Serial.print(adcPrimario);
  Serial.print(",");

  Serial.print("\"sct_secundario\":");
  Serial.print(adcSecundario);

  Serial.print("},");

  Serial.print("\"medidas\":{");

  Serial.print("\"temperatura_c\":");
  Serial.print(temperatura, 2);
  Serial.print(",");

  Serial.print("\"vibracao_rms_v\":");
  Serial.print(vibracaoRMS, 4);
  Serial.print(",");

  Serial.print("\"corrente_primario_a\":");
  Serial.print(correntePrimario, 3);
  Serial.print(",");

  Serial.print("\"corrente_secundario_a\":");
  Serial.print(correnteSecundario, 3);

  Serial.print("},");

  Serial.print("\"alarmes\":{");

  Serial.print("\"geral\":\"");
  Serial.print(alarme);
  Serial.print("\",");

  Serial.print("\"temperatura\":");
  Serial.print(temperatura >= LIMITE_TEMP_ALERTA ? "true" : "false");
  Serial.print(",");

  Serial.print("\"vibracao\":");
  Serial.print(vibracaoRMS >= LIMITE_VIB_ALERTA ? "true" : "false");
  Serial.print(",");

  Serial.print("\"primario\":");
  Serial.print(correntePrimario >= LIMITE_PRIM_ALERTA ? "true" : "false");
  Serial.print(",");

  Serial.print("\"secundario\":");
  Serial.print(correnteSecundario >= LIMITE_SEC_ALERTA ? "true" : "false");

  Serial.print("},");

  Serial.print("\"diagnostico\":\"");

  if (strcmp(alarme, "verde") == 0) {
    Serial.print("Operacao normal dentro dos limites simulados.");
  } else if (strcmp(alarme, "amarelo") == 0) {
    Serial.print("Alerta operacional. Verificar tendencia de temperatura, vibracao e corrente.");
  } else {
    Serial.print("Condicao critica. Recomenda-se inspecao imediata do transformador.");
  }

  Serial.print("\"");

  Serial.println("}");
}

// =====================================================
// COMANDOS DA IHM
// =====================================================
// START  -> inicia aquisição
// STOP   -> para aquisição
// RESET  -> reconhece/reset alarmes
// =====================================================
void processarComandos() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "START") {
    aquisicaoAtiva = true;
    Serial.println("{\"type\":\"status\",\"message\":\"aquisicao_iniciada\"}");
  } 
  else if (cmd == "STOP") {
    aquisicaoAtiva = false;
    Serial.println("{\"type\":\"status\",\"message\":\"aquisicao_parada\"}");
  } 
  else if (cmd == "RESET") {
    alarmesReconhecidos = true;
    Serial.println("{\"type\":\"status\",\"message\":\"alarmes_reconhecidos\"}");
  } 
  else {
    Serial.println("{\"type\":\"status\",\"message\":\"comando_invalido\"}");
  }
}

// =====================================================
// SETUP
// =====================================================
void setup() {
  Serial.begin(SERIAL_BAUD);
  Serial.setTimeout(20);

  pinMode(PIN_NTC, INPUT);
  pinMode(PIN_VIBRACAO, INPUT);
  pinMode(PIN_SCT_PRIMARIO, INPUT);
  pinMode(PIN_SCT_SECUNDARIO, INPUT);

  Serial.println("{\"type\":\"status\",\"message\":\"sistema_iniciado\",\"baud\":9600}");
}

// =====================================================
// LOOP
// =====================================================
void loop() {
  processarComandos();

  if (!aquisicaoAtiva) {
    delay(100);
    return;
  }

  unsigned long agora = millis();

  if (agora - ultimoEnvio >= INTERVALO_ENVIO_MS) {
    ultimoEnvio = agora;
    alarmesReconhecidos = false;

    enviarPacoteJSON();
  }
}
