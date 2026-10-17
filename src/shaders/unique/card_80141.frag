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

vec2 blade(float s, float lower) {
    vec2 a=mix(vec2(0.375,0.275),vec2(0.665,0.409),lower);
    vec2 b=mix(vec2(0.510,0.318),vec2(0.551,0.496),lower);
    vec2 c=mix(vec2(0.643,0.283),vec2(0.396,0.469),lower);
    return mix(mix(a,b,s),mix(b,c,s),s);
}
float oval(vec2 p,vec2 c,vec2 r) {
    return 1.0-smoothstep(0.45,1.0,length((p-c)/r));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.1379);
    // The name/class banner, both left badges and every bottom stat remain intact.
    float art=smoothstep(0.143,0.154,p.y)*(1.0-smoothstep(0.545,0.558,p.y));
    art*=smoothstep(0.014,0.032,p.x)*(1.0-smoothstep(0.970,0.987,p.x));
    art*=clamp(smoothstep(0.165,0.185,p.x)+smoothstep(0.296,0.315,p.y),0.0,1.0);
    vec3 color=scan.rgb;
    vec2 aspect=vec2(1.0,1.4113);
    float poison=0.0;
    float glints=0.0;
    // The two curved green edges are the actual poisoned daggers in the scan.
    // A broad bead traverses each blade, then a second answers it below.
    for(int k=0;k<2;k++) {
        float lower=float(k);
        float nearest=10.0;
        float along=0.0;
        for(int j=0;j<18;j++) {
            float s=float(j)/18.0;
            vec2 a=blade(s,lower);
            vec2 b=blade(s+1.0/18.0,lower);
            vec2 v=(b-a)*aspect;
            vec2 q=(p-a)*aspect;
            float h=clamp(dot(q,v)/max(dot(v,v),0.000001),0.0,1.0);
            float d=length(q-v*h);
            if(d<nearest) { nearest=d; along=s+h/18.0; }
        }
        float run=fract(t*0.47+seed*0.3+lower*0.47);
        float gap=abs(along-run);
        float bead=exp(-gap*gap/0.014);
        float edge=1.0-smoothstep(0.002,0.004+aa,nearest);
        float halo=exp(-nearest*nearest/0.00028);
        poison+=edge*(0.13+0.56*bead)+halo*bead*0.23;
        glints+=edge*bead;
    }
    color+=vec3(0.10,0.70,0.20)*poison;
    color+=(1.0-color)*vec3(0.60,0.83,0.19)*glints*0.45;

    // Drops detach from the blade tips and carry the poison downward.
    for(int i=0;i<8;i++) {
        float fi=float(i);
        float lower=step(3.5,fi);
        float age=fract(t*0.39+fi*0.243+seed*0.24);
        vec2 origin=mix(vec2(0.621,0.288),vec2(0.414,0.471),lower);
        vec2 c=origin+vec2(0.021*sin(age*7.0+fi*1.9),age*0.074);
        float fade=smoothstep(0.0,0.12,age)*(1.0-smoothstep(0.65,1.0,age));
        vec2 q=(p-c)*aspect;
        float drop=1.0-smoothstep(0.0035,0.006+aa,length(q));
        float mist=exp(-dot(q,q)/0.00032);
        color+=(1.0-color)*vec3(0.29,0.85,0.11)*(drop*0.82+mist*0.13)*fade;
    }
    // Thin vapour coils stay around the weapons rather than covering her face.
    float upper=oval(p,vec2(0.58,0.325),vec2(0.125,0.057));
    float lower=oval(p,vec2(0.49,0.493),vec2(0.13,0.044));
    float wave=sin(p.x*42.0+t*3.4+sin(p.y*65.0-t*2.1));
    float wisp=pow(max(0.0,wave),9.0)*(upper+lower);
    color+=vec3(0.015,0.15,0.035)*wisp;

    if(u_is_foil) {
        // Iridescent embossed fur, cloth and steel are visibly coated even at t=0.
        float face=oval(p,vec2(0.516,0.233),vec2(0.086,0.067));
        float fur=oval(p,vec2(0.652,0.254),vec2(0.143,0.100));
        float belt=oval(p,vec2(0.466,0.516),vec2(0.16,0.047));
        float phase=p.x*2.1+p.y*3.2+sin(p.x*21.0-p.y*17.0)*0.09-t*0.12+seed*0.12;
        vec3 rainbow=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.36,0.69)));
        vec3 coated=mix(2.0*color*rainbow,1.0-2.0*(1.0-color)*(1.0-rainbow),step(vec3(0.5),color));
        color=mix(color,coated,(0.38+fur*0.17)*(1.0-face*0.85));
        float sheen=pow(0.5+0.5*sin(p.x*18.0+p.y*24.0-t*1.8),6.0);
        float metal=clamp(fur*0.62+belt*0.55+poison,0.0,1.0);
        color+=(1.0-color)*mix(vec3(0.65,0.85,0.20),rainbow,0.62)*metal*(0.16+sheen*0.48);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
