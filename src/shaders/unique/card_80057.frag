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

float oval(vec2 p,vec2 c,vec2 r) {
    return 1.0-smoothstep(0.72,1.0,length((p-c)/r));
}
float hash(float n) { return fract(sin(n*127.1+19.7)*43758.5453); }
float line(vec2 p,vec2 a,vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(0.0007,0.75/max(u_resolution.x,1.0));
    float t=u_time;
    float seed=fract(u_seed*0.117);
    float art=smoothstep(0.138,0.151,p.y)*(1.0-smoothstep(0.542,0.560,p.y));
    art*=smoothstep(0.008,0.022,p.x)*(1.0-smoothstep(0.978,0.994,p.x));
    // Exclude the armor icon and its attached numeral, with a generous margin.
    art*=clamp(smoothstep(0.172,0.195,p.x)+smoothstep(0.222,0.239,p.y),0.0,1.0);
    vec3 color=scan.rgb;
    float luminance=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float shield=oval(p,vec2(0.232,0.353),vec2(0.229,0.119));
    float axe=oval(p,vec2(0.847,0.442),vec2(0.153,0.111));
    float face=oval(p,vec2(0.415,0.229),vec2(0.112,0.113));

    // A counterblow strikes the shield boss, then travels back across the
    // segmented iron face. Three expanding rims make the impact legible small.
    float cycle=fract(t*0.43+seed);
    vec2 q=(p-vec2(0.188,0.387))*vec2(1.0,1.32);
    float impact=0.0;
    for(int i=0;i<3;i++) {
        float age=fract(cycle+float(i)*0.19);
        float radius=0.025+age*0.29;
        float rim=1.0-smoothstep(0.003,0.007+aa,abs(length(q)-radius));
        impact+=rim*(1.0-age)*(1.0-age);
    }
    float metal=smoothstep(0.17,0.48,luminance);
    color+=vec3(0.16,0.42,0.53)*impact*shield*(0.5+metal*0.5);
    float boss=oval(p,vec2(0.190,0.383),vec2(0.028,0.025));
    color+=vec3(0.30,0.52,0.62)*boss*pow(1.0-cycle,7.0);
    // Retaliation: sparks leave the shield's outer edge toward the attacker.
    for(int i=0;i<7;i++) {
        float fi=float(i);
        float age=fract(cycle+fi*0.137);
        vec2 origin=vec2(0.148,0.378)+(vec2(hash(fi),hash(fi+17.0))-0.5)*vec2(0.09,0.08);
        vec2 velocity=vec2(-0.15,-0.035+hash(fi+3.0)*0.07);
        vec2 tip=origin+velocity*age;
        float stroke=1.0-smoothstep(0.001,0.002+aa,line(p,tip,tip-velocity*0.13));
        color+=vec3(0.30,0.56,0.65)*stroke*sin(age*3.141593);
    }

    // Two successive attacks: a pair of sweeping blade-edge crescents around
    // the real double axe, with traveling bright leading tips.
    vec2 a=(p-vec2(0.831,0.438))*vec2(1.0,1.35);
    float theta=atan(a.y,a.x);
    float attack=fract(t*0.48+seed+0.22);
    float slash=0.0;
    for(int i=0;i<2;i++) {
        float age=fract(attack-float(i)*0.26);
        float angle=-2.5+age*5.3;
        float delta=mod(theta-angle+3.141593,6.2831853)-3.141593;
        float tail=smoothstep(-1.40,-0.95,delta)*(1.0-smoothstep(-0.12,0.06,delta));
        float arc=1.0-smoothstep(0.0025,0.006+aa,abs(length(a)-(0.115+float(i)*0.026)));
        slash+=arc*tail*sin(age*3.141593);
    }
    color+=vec3(0.22,0.48,0.58)*slash*axe;
    float edgeSweep=exp(-pow((p.x-(0.68+fract(t*0.67+seed)*0.34))/0.027,2.0));
    color+=vec3(0.12,0.24,0.29)*axe*edgeSweep*metal;

    // Wind drives short snow streaks across the mountain pass and around his
    // planted hooves; the central face stays clean and warm.
    float snow=0.0;
    for(int i=0;i<22;i++) {
        float fi=float(i);
        float age=fract(t*(0.16+hash(fi+20.0)*0.11)+hash(fi+60.0)+seed);
        vec2 center=vec2(1.06-age*1.14,0.143+hash(fi+30.0)*0.405);
        center.y+=sin(age*5.0+fi)*0.010;
        float d=line(p,center,center+vec2(0.017+hash(fi+1.0)*0.025,-0.007));
        snow+=(1.0-smoothstep(0.0012,0.0024+aa,d))*sin(age*3.141593);
    }
    color+=vec3(0.36,0.48,0.51)*snow*(1.0-face)*(1.0-shield*0.6);

    if(u_is_foil) {
        // Cold forged armor and the broad black weapons carry a saturated
        // titanium spectrum, already apparent when time is frozen at zero.
        float armor=oval(p,vec2(0.493,0.299),vec2(0.266,0.174));
        float coat=clamp(shield+axe+armor*0.55,0.0,1.0)*(1.0-face);
        vec3 spectral=0.5+0.5*cos(6.2831853*(p.x*1.8+p.y*2.6+t*0.11+seed+vec3(0.0,0.33,0.67)));
        color=mix(color,color*(0.68+0.95*spectral)+spectral*0.11,coat*0.76);
        float stripe=pow(0.5+0.5*sin(p.x*25.0-p.y*20.0-t*1.7),14.0);
        color+=mix(vec3(0.18,0.30,0.35),spectral*0.42,0.65)*stripe*coat*(0.35+metal*0.65);
        float mountains=(1.0-coat)*(1.0-face)*smoothstep(0.42,0.84,luminance);
        color=mix(color,color*(0.83+spectral*0.29),mountains*0.65);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
