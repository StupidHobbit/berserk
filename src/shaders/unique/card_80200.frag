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

// Кайна Наварро: sea wind catches the red scarf and silver sabre;
// a small brass luck die rolls in the open sky beside the pirate.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.40,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.00001),0.0,1.0));
}
vec2 sabre(float s) {
    return mix(vec2(0.155,0.338),vec2(0.501,0.438),s)
           +vec2(0.0,0.026*sin(s*3.14159265));
}
void main() {
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(0.0,u_time);
    float seed=fract(u_seed*0.1377)*6.2831853;
    float art=smoothstep(0.140,0.153,p.y)*(1.0-smoothstep(0.540,0.557,p.y));
    art*=smoothstep(0.012,0.029,p.x)*(1.0-smoothstep(0.970,0.991,p.x));
    art*=smoothstep(1.0,1.15,length((p-vec2(0.108,0.181))/vec2(0.065,0.045)));
    art*=smoothstep(1.0,1.15,length((p-vec2(0.108,0.263))/vec2(0.065,0.045)));
    art*=smoothstep(1.0,1.14,length((p-vec2(0.151,0.289))/vec2(0.026,0.022)));
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;
    float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));

    // Only the loose scarf tails move. The face and tied bandana stay crisp.
    float scarf=oval(p,vec2(0.660,0.226),vec2(0.127,0.094));
    scarf*=smoothstep(0.542,0.584,p.x);
    vec2 flutter=vec2(0.0035*sin(t*1.8+p.y*43.0+seed),
                      0.0055*sin(t*2.1-p.x*27.0+seed))*scarf;
    vec3 cloth=texture2D(u_card,v_uv+flutter*vec2(1.0,-1.0)).rgb;
    color=mix(color,cloth,scarf*0.85);
    float red=smoothstep(0.08,0.31,cloth.r-cloth.g);
    color+=(1.0-color)*vec3(0.75,0.24,0.065)*scarf*red
           *(0.10+0.20*pow(0.5+0.5*sin(p.x*35.0-t*2.1+seed),3.0));

    // Sunlight travels along the curved painted sabre, from guard to tip.
    float steel=0.0;
    float glint=0.0;
    for (int i=0;i<24;i++) {
        float s=float(i)/24.0;
        float d=segment(p*vec2(1.0,1.4113),sabre(s)*vec2(1.0,1.4113),
                        sabre(s+1.0/24.0)*vec2(1.0,1.4113));
        float strip=1.0-smoothstep(0.002,0.012+aa,d);
        float sheen=pow(0.5+0.5*cos(s*7.0-t*2.4+seed),12.0);
        steel=max(steel,strip);
        glint=max(glint,strip*sheen);
    }
    color+=(1.0-color)*vec3(0.71,0.91,1.0)*(steel*0.12+glint*0.80);

    // The three prominent painted gulls catch alternating wing reflections.
    float feathers=0.0;
    for (int i=0;i<3;i++) {
        float k=float(i);
        vec2 c=vec2(0.858,0.246);
        vec2 r=vec2(0.146,0.054);
        if (i==1) { c=vec2(0.728,0.347); r=vec2(0.089,0.041); }
        if (i==2) { c=vec2(0.913,0.486); r=vec2(0.069,0.044); }
        float white=smoothstep(0.45,0.77,lum)*(1.0-smoothstep(0.15,0.37,scan.b-scan.r));
        float f=oval(p,c,r)*white;
        feathers+=f;
        float light=pow(0.5+0.5*sin((p.x-c.x)*47.0-t*2.0+k+seed),3.0);
        color+=(1.0-color)*vec3(0.83,0.91,0.94)*f*(0.10+light*0.45);
    }

    // A little translucent brass die expresses her pre-battle recruitment roll.
    // Slow rocking and changing pips read clearly without crossing the figure.
    vec2 center=vec2(0.850,0.403+0.004*sin(t*1.1+seed));
    vec2 q=(p-center)*vec2(1.0,1.4113);
    float angle=0.20*sin(t*1.3+seed);
    q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*q;
    float box=max(abs(q.x),abs(q.y));
    float die=1.0-smoothstep(0.026,0.028+aa,box);
    float rim=(1.0-smoothstep(0.001,0.0025+aa,abs(box-0.026)));
    color=mix(color,vec3(0.21,0.13,0.042),die*0.35);
    color+=vec3(0.88,0.64,0.27)*rim*0.65;
    float roll=mod(floor(t*0.8+seed),6.0)+1.0;
    float dots=0.0;
    for (int i=0;i<6;i++) {
        float k=float(i);
        vec2 c=vec2(mod(k,2.0)*0.025-0.0125,floor(k/2.0)*0.013-0.013);
        float on=1.0-step(roll,k);
        dots+=(1.0-smoothstep(0.002,0.0035+aa,length(q-c)))*on;
    }
    color+=vec3(0.97,0.79,0.39)*dots*0.75;

    if (u_is_foil) {
        // Embossed sea-silk: broad rainbow metal across blouse and blue sky,
        // stronger silver on her blade and gulls, copper along the red scarf.
        float blouse=oval(p,vec2(0.459,0.424),vec2(0.337,0.137));
        float sky=smoothstep(0.09,0.31,scan.b-scan.r)*smoothstep(0.23,0.55,scan.g);
        float face=oval(p,vec2(0.475,0.256),vec2(0.083,0.076));
        float finish=clamp(sky*0.80+blouse*0.70+scarf*red+steel+feathers,0.0,1.0)*(1.0-face);
        float phase=p.x*2.5+p.y*3.4+0.20*sin(p.y*19.0)-t*0.18+seed*0.10;
        vec3 rainbow=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float flash=pow(0.5+0.5*sin(phase*6.2831853),7.0);
        float emboss=0.5+0.5*sin(p.x*153.0+p.y*98.0+sin(p.y*35.0)*2.0);
        color*=1.0-finish*(0.13+0.035*emboss);
        color+=(1.0-color)*mix(vec3(0.72,0.88,0.98),rainbow,0.73)
               *finish*(0.28+0.60*flash);
        color+=rainbow*(rim*0.24+glint*0.15);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
