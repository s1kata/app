const fs = require('fs');
const path = 'src/screens/ApiTourSearchScreen.tsx';
let s = fs.readFileSync(path, 'utf8');
s = s.replace("import ScreenHeader from '../components/ui/ScreenHeader';\n", '');
s = s.replace("import PrimaryButton from '../components/ui/PrimaryButton';\n", '');
fs.writeFileSync(path, s, 'utf8');
console.log('cleaned unused imports');
