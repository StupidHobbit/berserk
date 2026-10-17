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

// Куссума: dark-element energy rises from the violet blade into the painted
// spectre. Three lingering blights in the forest floor feed his golden robes.
float oval(vec2 p,vec2 c,vec2 r) {
    return 1.0-smoothstep(0.15,1.0,length((p-c)/r));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 original=texture2D(u_card,v_uv);
    vec3 col=original.rgb;
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float seed=fract(u_seed*0.173);
    float t=max(u_time,0.0);
    float clock=t+seed*2.8;
    float art=smoothstep(0.138,0.149,p.y)*(1.0-smoothstep(0.550,0.563,p.y));
    art*=smoothstep(0.009,0.019,p.x)*(1.0-smoothstep(0.981,0.991,p.x));
    // Round shield in the upper-left is printed information, not forest.
    art*=smoothstep(0.061,0.074,length((p-vec2(0.109,0.181))*vec2(1.0,1.4113)));
    float lum=dot(original.rgb,vec3(0.2126,0.7152,0.0722));
    float pulse=0.5+0.5*sin(clock*1.75);

    // Color selection keeps the flowing charge on the existing violet spirit
    // and blade; it cannot paint across his white sleeve or face.
    float spiritRegion=oval(p,vec2(0.789,0.291),vec2(0.197,0.150));
    float bladeRegion=oval(p,vec2(0.808,0.490),vec2(0.146,0.044));
    float violet=smoothstep(0.018,0.18,original.r-original.g)
                *smoothstep(0.015,0.13,original.b-original.g);
    float spirit=spiritRegion*violet;
    float blade=bladeRegion*violet;
    float flow=pow(0.5+0.5*sin(p.y*57.0-p.x*17.0+clock*3.6),3.0);
    col+=(1.0-col)*vec3(0.79,0.20,1.0)*spirit*(0.32+0.68*flow);
    col+=(1.0-col)*vec3(1.0,0.33,0.80)*blade*(0.40+0.48*pulse);
    // The small spectral animal's eye and the blade tip remain fixed anchors.
    float spiritEye=oval(p,vec2(0.676,0.346),vec2(0.013,0.006));
    float tip=oval(p,vec2(0.899,0.500),vec2(0.027,0.012));
    col+=vec3(1.0,0.44,0.89)*spiritEye*(0.38+0.56*pulse);
    col+=(1.0-col)*vec3(0.96,0.38,1.0)*tip*(0.16+0.40*pulse);

    // Whispering motes climb the same S-shaped route as the painted spirit.
    // They originate behind the dagger hand, bend right, then drift upward.
    float motes=0.0;
    for(int i=0;i<18;i++) {
        float k=float(i);
        float h=fract(sin(k*47.13+seed*9.0)*1743.57);
        float phase=fract(clock*0.105+k/18.0);
        float y=0.510-phase*0.318;
        float x=0.810+0.065*sin(phase*7.7)+0.035*sin(k*8.7+clock*0.48);
        vec2 d=(p-vec2(x,y))*vec2(1.0,1.4113);
        float radius=0.0017+0.0036*h;
        float life=smoothstep(0.0,0.12,phase)*(1.0-smoothstep(0.82,1.0,phase));
        motes+=(1.0-smoothstep(radius,radius+aa,length(d)))*life;
    }
    // Sleeve occlusion uses its pale paint and lower-arm silhouette.
    float sleeve=oval(p,vec2(0.660,0.397),vec2(0.26,0.072))*smoothstep(0.48,0.72,lum);
    col+=(1.0-col)*vec3(0.93,0.31,0.91)*motes*(1.0-sleeve)*0.72;

    // Three rot markers correspond to his maximum +3 attack bonus. Low,
    // broken violet rings nest in the vegetation left in his wake.
    float rot=0.0;
    float rotGlow=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i);
        vec2 center=vec2(0.067+k*0.092,0.524-k*0.028);
        vec2 q=(p-center)*vec2(1.0,2.8);
        float r=0.030+0.004*sin(clock*1.6-k*1.7);
        float d=length(q);
        float angle=atan(q.y,q.x);
        float broken=smoothstep(-0.60,0.12,sin(angle*3.0+k*2.0-clock*0.46));
        rot+=(1.0-smoothstep(0.001,0.0025+aa,abs(d-r)))*broken;
        rotGlow+=exp(-d*d/0.0013)*(0.65+0.35*sin(clock*1.6-k*1.7));
    }
    col*=1.0-0.15*rotGlow;
    col+=(1.0-col)*vec3(0.56,0.13,0.72)*(rot*0.67+rotGlow*0.20);
    // The robe's ruby clasps pass the same pulse from heart to belt.
    float gems=oval(p,vec2(0.345,0.310),vec2(0.010,0.011))
              +oval(p,vec2(0.383,0.451),vec2(0.013,0.018));
    col+=(1.0-col)*vec3(0.95,0.24,0.77)*gems*(0.30+0.55*pulse);

    if(u_is_foil) {
        float robe=oval(p,vec2(0.404,0.412),vec2(0.205,0.167))
                  +oval(p,vec2(0.662,0.399),vec2(0.249,0.071));
        robe=clamp(robe,0.0,1.0);
        float face=oval(p,vec2(0.332,0.224),vec2(0.083,0.072));
        float gold=smoothstep(0.025,0.17,original.r-original.b)
                  *smoothstep(0.16,0.51,lum)*robe;
        float phase=p.x*2.6+p.y*3.6+0.11*sin(p.y*31.0)-t*0.12+seed*0.18;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 coated=mix(2.0*col*spectrum,1.0-2.0*(1.0-col)*(1.0-spectrum),step(vec3(0.5),col));
        col=mix(col,coated,(0.34+0.19*robe)*(1.0-face*0.85));
        float polished=pow(0.5+0.5*sin(p.x*17.0+p.y*24.0-t*1.15),10.0);
        col+=(1.0-col)*mix(vec3(0.86,0.95,1.0),spectrum,0.56)
             *(0.12+0.47*polished)*(0.35+0.65*robe)*(1.0-face*0.88);
        col+=(1.0-col)*mix(vec3(1.0,0.76,0.28),spectrum,0.30)*gold*(0.24+0.44*polished);
        col+=(1.0-col)*mix(vec3(0.98,0.66,1.0),spectrum,0.45)*(spirit+blade)*0.35;
    }
    gl_FragColor=vec4(mix(original.rgb,clamp(col,0.0,1.0),art),original.a);
}
