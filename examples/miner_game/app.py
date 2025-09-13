from flask import Flask, render_template, jsonify, request
import json
import random
import os

app = Flask(__name__)

# Game configuration
GAME_CONFIG = {
    'canvas_width': 800,
    'canvas_height': 600,
    'time_limit': 60,  # seconds
    'levels': [
        {
            'level': 1,
            'target_score': 500,
            'time': 60,
            'objects': [
                {'type': 'gold_small', 'value': 50, 'weight': 1, 'count': 5},
                {'type': 'gold_medium', 'value': 100, 'weight': 2, 'count': 3},
                {'type': 'gold_large', 'value': 250, 'weight': 3, 'count': 2},
                {'type': 'rock', 'value': 10, 'weight': 4, 'count': 3},
                {'type': 'diamond', 'value': 500, 'weight': 0.5, 'count': 1},
            ]
        },
        {
            'level': 2,
            'target_score': 1000,
            'time': 60,
            'objects': [
                {'type': 'gold_small', 'value': 50, 'weight': 1, 'count': 4},
                {'type': 'gold_medium', 'value': 100, 'weight': 2, 'count': 4},
                {'type': 'gold_large', 'value': 250, 'weight': 3, 'count': 3},
                {'type': 'rock', 'value': 10, 'weight': 4, 'count': 4},
                {'type': 'diamond', 'value': 500, 'weight': 0.5, 'count': 2},
                {'type': 'mystery_bag', 'value': 'random', 'weight': 1.5, 'count': 2},
            ]
        },
        {
            'level': 3,
            'target_score': 1500,
            'time': 60,
            'objects': [
                {'type': 'gold_small', 'value': 50, 'weight': 1, 'count': 3},
                {'type': 'gold_medium', 'value': 100, 'weight': 2, 'count': 5},
                {'type': 'gold_large', 'value': 250, 'weight': 3, 'count': 4},
                {'type': 'rock', 'value': 10, 'weight': 4, 'count': 5},
                {'type': 'diamond', 'value': 500, 'weight': 0.5, 'count': 3},
                {'type': 'mystery_bag', 'value': 'random', 'weight': 1.5, 'count': 3},
                {'type': 'tnt', 'value': -100, 'weight': 0.1, 'count': 2},
            ]
        }
    ]
}

# Game state
game_state = {
    'score': 0,
    'level': 1,
    'time_remaining': 60,
    'high_score': 0
}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/game_config')
def get_game_config():
    return jsonify(GAME_CONFIG)

@app.route('/api/game_state')
def get_game_state():
    return jsonify(game_state)

@app.route('/api/update_score', methods=['POST'])
def update_score():
    data = request.json
    game_state['score'] = data.get('score', 0)
    if game_state['score'] > game_state['high_score']:
        game_state['high_score'] = game_state['score']
    return jsonify({'success': True, 'high_score': game_state['high_score']})

@app.route('/api/next_level', methods=['POST'])
def next_level():
    data = request.json
    game_state['level'] = data.get('level', 1)
    return jsonify({'success': True, 'level': game_state['level']})

@app.route('/api/reset_game', methods=['POST'])
def reset_game():
    game_state['score'] = 0
    game_state['level'] = 1
    game_state['time_remaining'] = 60
    return jsonify({'success': True})

if __name__ == '__main__':
    # Create templates and static directories if they don't exist
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static', exist_ok=True)
    os.makedirs('static/css', exist_ok=True)
    os.makedirs('static/js', exist_ok=True)
    
    app.run(debug=True, host='0.0.0.0', port=5010)