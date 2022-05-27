module.exports = {
    'env': {
        'browser': true,
        'node': true,
        'es2021': true
    },
    'globals': {
      'VERSION': 'readonly'
      // 'module': 'readonly',
      // 'require': 'readonly'
    },
    'extends': 'eslint:recommended',
    'parserOptions': {
        'ecmaVersion': 'latest',
        'sourceType': 'module'
    },
    'rules': {
        'no-prototype-builtins': ['off'], // allow obj.hasOwnProperty()
        'no-control-regex': ['off'],
        'no-empty': ['off'], // allow try { ... } catch(e) {}
        'no-constant-condition': ['off'], // allow while(true)
        'no-unused-vars': ['off'],
        'indent': [
            'off', // indent rule is troublesome
            2
        ],
        'linebreak-style': [
            'error',
            'unix'
        ],
        'quotes': [
            'off',
            'single'
        ],
        'semi': [
            'error',
            'always'
        ]
    }
};
