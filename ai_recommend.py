import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from g4f import Client
import json

app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    return "Backend is running!"

@app.route('/api/ai-recommend', methods=['POST'])
def ai_recommend():
    # Load list of episode dicts from local file
    try:
        with open("watch_history.json", "r", encoding="utf-8") as file:
            episodes = json.load(file)
    except Exception as e:
        return jsonify({'recommendation': '', 'error': f'Could not load watch_history.json: {str(e)}'}), 500

    # Format all episodes into one text block
    all_episodes_text = ""
    for i, episode in enumerate(episodes):
        episode_text = "\n".join(f"{key}: {value}" for key, value in episode.items())
        all_episodes_text += f"\nEpisode {i+1}:\n{episode_text}\n"

    # Use the type from the POST body if you want (optional)
    data = request.json or {}
    rec_type = data.get('type', 'movie')
    prompt = f"Can you based on this list recommend me 5 {'tv shows' if rec_type == 'tv' else 'movies'} that I haven't watched before (not in the list)?\n" + all_episodes_text

    client = Client()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        web_search=False
    )
    return jsonify({'recommendation': response.choices[0].message.content})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))  # Use Render port or fallback 5000
    app.run(host='0.0.0.0', port=port)