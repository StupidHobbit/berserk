#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

float oval(vec2 p,vec2 c,vec2 r){
    return 1.0-smoothstep(.45,1.0,length((p-c)/r));
}
vec2 lash(float s,float t){
    // Follow the red flying beast's arch, then its fine tether to Furs's hand.
    if(s<.70){
        float a=2.97-(s/.70)*3.66;
        return vec2(.663,.266)+vec2(.229*cos(a),-.113*sin(a));
    }
    float a=(s-.70)/.30;
    vec2 start=vec2(.840,.338), control=vec2(.858,.389), end=vec2(.673,.426);
    return (1.0-a)*(1.0-a)*start+2.0*a*(1.0-a)*control+a*a*end
        +vec2(.010*sin(a*7.0-t*4.0),.006*sin(a*9.0-t*4.0))*sin(a*3.141593);
}
void main(){
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=1.0/max(u_resolution.x,1.0);
    float t=max(u_time,0.0);
    float seed=fract(u_seed*.137)*6.283185;
    float art=smoothstep(.139,.155,p.y)*(1.0-smoothstep(.542,.555,p.y));
    art*=smoothstep(.012,.030,p.x)*(1.0-smoothstep(.970,.988,p.x));
    // Preserve the anchor and its overlapping circular counter exactly.
    art*=smoothstep(.060,.079,length((p-vec2(.111,.184))*vec2(1.0,1.411)));
    art*=smoothstep(.025,.042,length((p-vec2(.151,.205))*vec2(1.0,1.411)));

    // The trained red creatures breathe and turn around their still handler.
    float crest=oval(p,vec2(.852,.260),vec2(.125,.121));
    float leftBeast=oval(p,vec2(.194,.367),vec2(.113,.122));
    float face=oval(p,vec2(.610,.281),vec2(.095,.078));
    vec2 drift=vec2(.006*sin(t*2.3+seed),.004*cos(t*1.8+seed))*crest;
    drift+=vec2(.004*sin(t*2.0+p.y*16.0),.005*sin(t*1.7+seed))*leftBeast;
    drift*=art*(1.0-face);
    vec3 color=texture2D(u_card,v_uv+vec2(drift.x,-drift.y)).rgb;

    // A whip command travels from the fist, around the flying creature,
    // then snaps along the tether. Successive amber heads leave red tails.
    float charge=0.0, line=0.0;
    float travel=fract(t*.42+seed*.11);
    for(int i=0;i<28;i++){
        float s=float(i)/28.0;
        vec2 a=lash(s,t), b=lash(s+1.0/28.0,t);
        vec2 ab=b-a;
        float h=clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0);
        float d=length((p-a-h*ab)*vec2(1.0,1.411));
        float position=s+h/28.0;
        float behind=fract(travel-position+1.0);
        float pulse=exp(-behind*19.0);
        float core=1.0-smoothstep(.0018,.0040+aa*.65,d);
        float glow=exp(-d*d/.00029);
        charge=max(charge,(core*.65+glow*.46)*pulse);
        line=max(line,core*smoothstep(.69,.74,position));
    }
    color+=vec3(.55,.20,.018)*charge;
    color+=vec3(.12,.022,.014)*line*(.65+.35*sin(t*5.0));

    // A flying ally's wake moves through the sunlit gaps around the torso.
    float wake=0.0;
    for(int i=0;i<8;i++){
        float k=float(i);
        float age=fract(t*.31+k*.139+seed*.07);
        vec2 c=vec2(.07+.90*age,.49-.26*age+.024*sin(k*2.7));
        vec2 q=(p-c)*vec2(1.0,1.411);
        q.y+=q.x*.40;
        float streak=exp(-q.y*q.y/.000012)*exp(-q.x*q.x/.00075);
        float ends=sin(age*3.141593);
        wake+=streak*ends;
    }
    float gaps=oval(p,vec2(.206,.267),vec2(.105,.117))
              +oval(p,vec2(.930,.465),vec2(.080,.082));
    color+=vec3(.34,.19,.025)*wake*min(gaps,1.0);

    if(u_is_foil){
        // Red bronze and green gold facets stay clearly visible at t = 0.
        float phase=p.x*1.5+p.y*1.9+seed*.09-t*.12;
        vec3 hue=.5+.5*cos(6.283185*(phase+vec3(.0,.32,.65)));
        vec3 metal=mix(2.0*color*hue,1.0-2.0*(1.0-color)*(1.0-hue),step(vec3(.5),color));
        float armor=oval(p,vec2(.581,.407),vec2(.189,.144));
        color=mix(color,metal,(.38+.16*armor)*(1.0-face*.75));
        float facet=pow(.5+.5*sin(p.x*23.0-p.y*17.0-t*1.7+seed),12.0);
        color+=(1.0-color)*(vec3(.17,.08,.015)+hue*.26)*facet*(1.0-face);
        color+=vec3(.07,.20,.18)*charge;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
