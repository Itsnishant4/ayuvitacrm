const partners = [
  { id: 7, name: 'Bhavin Bhai', parent_code: '', referral_code: 'GF-0001', role: 'state_franchisee' },
  { id: 342, name: '\tPoonam donga\t', parent_code: 'GF-0001', referral_code: 'AV-096', role: 'retailer' }
];

const getPartnerByCode = (code) => {
  if (!code) return null;
  return partners.find(p => p.referral_code.toLowerCase() === code.toLowerCase());
};

const getChainNodes = (referralCode) => {
  if (!referralCode) return [];
  
  const partner = getPartnerByCode(referralCode);
  if (!partner) return [{ name: referralCode, referral_code: referralCode, role: 'retailer' }];
  
  const nodes = [];
  let current = partner;
  let depth = 0;
  
  while (current && depth < 10) {
    nodes.unshift(current);
    if (current.parent_code) {
      const parent = partners.find(p => p.referral_code.toLowerCase() === current.parent_code.toLowerCase());
      if (parent) {
        current = parent;
      } else {
        nodes.unshift({ name: current.parent_code, referral_code: current.parent_code, role: 'state_franchisee' });
        break;
      }
    } else {
      break;
    }
    depth++;
  }
  
  return nodes;
};

const nodes = getChainNodes('AV-096');
console.log(nodes.map(n => ({ name: n.name, role: n.role, letter: n.name ? n.name[0].toUpperCase() : n.referral_code[0].toUpperCase() })));
