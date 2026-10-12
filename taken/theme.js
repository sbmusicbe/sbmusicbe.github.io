// Klose: thema vooraf instellen (geen flits) en niet in een frame laten tonen (clickjacking)
try{var t=localStorage.getItem("taken.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}
try{if(window.top!==window.self){document.documentElement.style.display='none';window.top.location=window.self.location}}catch(e){document.documentElement.style.display='none'}
