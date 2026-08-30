export default ({ env }) => ({
  apiUrl: env('CONVERTER_API_URL', 'http://localhost:8000'),
  apiKey: env('CONVERTER_API_KEY', ''),
});
